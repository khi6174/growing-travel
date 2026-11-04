import fs from 'node:fs/promises';
import path from 'node:path';

// D26: minimal field reports kept in one local JSON file. Reports describe what a traveler saw at the time,
// not the place's current state; confirmations ("아직 그래요"/"이제 아니에요") are kept per contributor.
// "한산함" (calm) lets a traveler say a place is easy right now, so live news is not only bad news (stage 5).
export const REPORT_CATEGORIES = Object.freeze({ crowd: '붐빔·대기', calm: '한산함', closed: '휴무·운영 변경', facility: '시설·공사', transit: '교통·길', tip: '현장 팁' });
export const VOTES = Object.freeze(['still', 'gone']);
export const SCORE = Object.freeze({ report: 10, vote: 2, confirmedByOthers: 1 });
// D27: how long a report describes "now" (P36). A wait is news for hours, construction for weeks; the
// latest "아직 그래요" restarts the window. Later stages fade expired reports on the map.
export const REPORT_VALID_HOURS = Object.freeze({ crowd: 3, calm: 3, transit: 24, closed: 72, facility: 336, tip: 720 });
// Categories that push a place back in the recommendation while active (명세 2-4 순위 원칙 3).
export const CAUTION_CATEGORIES = Object.freeze(['crowd', 'closed', 'facility']);
const CONTRIBUTOR = /^[A-Za-z0-9-]{8,64}$/;
const DEFAULT_NICKNAME = '익명 여행자';

export class ReportError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

export function validContributor(id) { return typeof id === 'string' && CONTRIBUTOR.test(id); }

function clean(value) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''; }

function reportStatus(votes) {
  const list = Object.values(votes);
  const still = list.filter((item) => item.vote === 'still');
  const gone = list.filter((item) => item.vote === 'gone');
  const lastConfirmedAt = still.map((item) => item.at).sort().at(-1) ?? null;
  const status = gone.length >= 2 && gone.length > still.length ? 'outdated' : still.length && still.length >= gone.length ? 'confirmed' : 'unconfirmed';
  return { still: still.length, gone: gone.length, lastConfirmedAt, status };
}

function publicReport(report, viewer, now = new Date()) {
  const { still, gone, lastConfirmedAt, status } = reportStatus(report.votes);
  const from = Date.parse(lastConfirmedAt ?? report.createdAt);
  const expiresAt = new Date(from + REPORT_VALID_HOURS[report.category] * 3600_000).toISOString();
  return {
    id: report.id, placeId: report.placeId, category: report.category, categoryLabel: REPORT_CATEGORIES[report.category],
    text: report.text, nickname: report.nickname, createdAt: report.createdAt,
    votes: { still, gone }, lastConfirmedAt, status, expiresAt, active: status !== 'outdated' && now < new Date(expiresAt),
    mine: viewer ? report.contributorId === viewer : false, myVote: viewer ? report.votes[viewer]?.vote ?? null : null,
  };
}

export function createReportStore({ file, isKnownPlace, now = () => new Date(), randomId = () => globalThis.crypto.randomUUID() }) {
  let chain = Promise.resolve();
  const exclusive = (action) => { const run = chain.then(action); chain = run.catch(() => {}); return run; };

  async function read() {
    let raw;
    try { raw = await fs.readFile(file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, reports: [] }; throw new ReportError('STORE_UNAVAILABLE', '현장 소식 저장소를 읽을 수 없어요.', 500); }
    try {
      const state = JSON.parse(raw);
      if (state?.schemaVersion !== 1 || !Array.isArray(state.reports)) throw new Error('Invalid envelope');
      return state;
    } catch { throw new ReportError('STORE_CORRUPT', '현장 소식 파일을 읽을 수 없어 덮어쓰지 않았어요.', 500); }
  }
  async function write(state) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(state, null, 2));
    await fs.rename(temp, file);
  }

  return {
    async list(placeId, viewer = null) {
      const { reports } = await read();
      return reports.filter((report) => report.placeId === placeId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((report) => publicReport(report, viewer, now()));
    },
    // D41: what the "뜨는 곳" tabs need per place: the newest still-valid 한산함 and 붐빔 reports, how many reports and
    // "아직 그래요" confirmations the last `days` brought, and when the place last woke (a report after `wakeHours` of
    // silence, or its first report ever).
    async activity(placeIds, { days = 7, wakeHours = 48 } = {}) {
      const { reports } = await read();
      const since = now().getTime() - days * 86_400_000;
      const result = {};
      for (const placeId of placeIds) {
        const own = reports.filter((report) => report.placeId === placeId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        if (!own.length) continue;
        let wokeAt = null;
        own.forEach((report, index) => { if (index === 0 || Date.parse(report.createdAt) - Date.parse(own[index - 1].createdAt) >= wakeHours * 3_600_000) wokeAt = report.createdAt; });
        const shown = own.map((report) => publicReport(report, null, now()));
        const latestActive = (category) => shown.filter((report) => report.active && report.category === category).at(-1) ?? null;
        const recent = shown.filter((report) => Date.parse(report.createdAt) >= since);
        result[placeId] = { calm: latestActive('calm'), crowd: latestActive('crowd'), reports: recent.length, confirmations: recent.reduce((sum, report) => sum + report.votes.still, 0), wokeAt };
      }
      return result;
    },
    // Short per-place summaries for the recommendation prompt; outdated reports are left out.
    async recentSummaries(placeIds, { perPlace = 3 } = {}) {
      const { reports } = await read();
      const result = {};
      for (const placeId of placeIds) {
        const items = reports.filter((report) => report.placeId === placeId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((report) => publicReport(report, null, now())).filter((report) => report.status !== 'outdated').slice(0, perPlace);
        if (items.length) result[placeId] = items.map(({ category, categoryLabel, text, createdAt, votes, lastConfirmedAt, expiresAt, active }) => ({ category, categoryLabel, text, createdAt, votes, lastConfirmedAt, expiresAt, active }));
      }
      return result;
    },
    async create(input) {
      const placeId = clean(input?.placeId);
      const category = clean(input?.category);
      const text = clean(input?.text);
      const nickname = clean(input?.nickname) || DEFAULT_NICKNAME;
      const contributorId = input?.contributorId;
      if (!validContributor(contributorId)) throw new ReportError('INVALID_CONTRIBUTOR', '기여자 정보를 다시 만들어 주세요.');
      if (!(await isKnownPlace(placeId))) throw new ReportError('UNKNOWN_PLACE', '알 수 없는 장소예요.');
      if (!Object.hasOwn(REPORT_CATEGORIES, category)) throw new ReportError('INVALID_CATEGORY', '소식 종류를 골라 주세요.');
      if (text.length < 2 || text.length > 200) throw new ReportError('INVALID_TEXT', '현장 소식은 2~200자로 적어 주세요.');
      if (nickname.length > 20) throw new ReportError('INVALID_NICKNAME', '닉네임은 20자 이하로 적어 주세요.');
      return exclusive(async () => {
        const state = await read();
        const report = { id: randomId(), placeId, category, text, nickname, contributorId, createdAt: now().toISOString(), votes: {} };
        state.reports.push(report);
        await write(state);
        return publicReport(report, contributorId, now());
      });
    },
    async vote(reportId, contributorId, vote) {
      if (!validContributor(contributorId)) throw new ReportError('INVALID_CONTRIBUTOR', '기여자 정보를 다시 만들어 주세요.');
      if (!VOTES.includes(vote)) throw new ReportError('INVALID_VOTE', '확인 표시를 다시 골라 주세요.');
      return exclusive(async () => {
        const state = await read();
        const report = state.reports.find((item) => item.id === reportId);
        if (!report) throw new ReportError('NOT_FOUND', '현장 소식을 찾을 수 없어요.', 404);
        if (report.contributorId === contributorId) throw new ReportError('OWN_REPORT', '내가 남긴 소식은 다른 여행자가 확인해요.', 409);
        report.votes[contributorId] = { vote, at: now().toISOString() };
        await write(state);
        return publicReport(report, contributorId, now());
      });
    },
    async contribution(contributorId) {
      if (!validContributor(contributorId)) throw new ReportError('INVALID_CONTRIBUTOR', '기여자 정보를 다시 만들어 주세요.');
      const { reports } = await read();
      const own = reports.filter((report) => report.contributorId === contributorId);
      const votes = reports.filter((report) => report.votes[contributorId]).length;
      const confirmedByOthers = own.reduce((sum, report) => sum + Object.values(report.votes).filter((item) => item.vote === 'still').length, 0);
      return { reports: own.length, votes, confirmedByOthers, score: own.length * SCORE.report + votes * SCORE.vote + confirmedByOthers * SCORE.confirmedByOthers };
    },
  };
}
