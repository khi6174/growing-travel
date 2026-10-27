import { INTERESTS } from './data.mjs';

export const PROFILE_STORAGE_KEY = 'growing-travel.local-profile.v1';
export const RESIDENCE_REGIONS = Object.freeze(['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']);
export const STUDENT_STATUSES = Object.freeze(['unspecified', 'student', 'not_student']);
export const DEFAULT_PROFILE = Object.freeze({ age: null, residenceRegion: '', interests: Object.freeze(['nature', 'quiet']), walkingLimitMinutes: 60, studentStatus: 'unspecified' });
const clone = (value) => JSON.parse(JSON.stringify(value));
const fail = (code, message, fields = {}) => Object.assign(new Error(message), { name: 'ProfileError', code, fields });
const integer = (value) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isInteger(Number(value));

export function normalizeProfile(raw = {}) {
  const fields = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw fail('INVALID_PROFILE', '개인 설정을 확인해 주세요.');
  const age = raw.age === undefined || raw.age === null || raw.age === '' ? null : Number(raw.age);
  if (age !== null && (!integer(raw.age) || age < 1 || age > 120)) fields.age = '만 나이는 1~120 사이 정수로 입력하거나 비워 두세요.';
  const residenceRegion = raw.residenceRegion ?? '';
  if (typeof residenceRegion !== 'string' || (residenceRegion !== '' && !RESIDENCE_REGIONS.includes(residenceRegion))) fields.residenceRegion = '거주 시·도를 선택하거나 미입력으로 두세요.';
  const studentStatus = raw.studentStatus === undefined ? 'unspecified' : raw.studentStatus;
  if (!STUDENT_STATUSES.includes(studentStatus)) fields.studentStatus = '대학생 여부를 선택하거나 미입력으로 두세요.';
  const suppliedInterests = raw.interests ?? DEFAULT_PROFILE.interests;
  const interests = Array.isArray(suppliedInterests) ? [...new Set(suppliedInterests)] : [];
  if (!interests.length || interests.some((id) => !INTERESTS.some((item) => item.id === id))) fields.interests = '관심 경험을 하나 이상 선택해 주세요.';
  const walkingInput = raw.walkingLimitMinutes ?? DEFAULT_PROFILE.walkingLimitMinutes;
  const walkingLimitMinutes = Number(walkingInput);
  if (!integer(walkingInput) || walkingLimitMinutes < 0 || walkingLimitMinutes > 720) fields.walkingLimitMinutes = '걷기 허용량을 0~720분 사이 정수로 입력해 주세요.';
  if (Object.keys(fields).length) throw fail('INVALID_PROFILE', '개인 설정을 확인해 주세요.', fields);
  return { age, residenceRegion, interests, walkingLimitMinutes, studentStatus };
}

export function createProfileStore(options = {}) {
  let storage;
  let accessError;
  try { storage = Object.hasOwn(options, 'storage') ? options.storage : globalThis.localStorage; }
  catch (error) { accessError = error; }
  const available = () => {
    if (accessError || !storage || typeof storage.getItem !== 'function') throw fail('PROFILE_UNAVAILABLE', '개인 설정 저장소를 읽을 수 없어요. 입력한 설정으로 계속할 수 있어요.');
  };
  function load() {
    available();
    let raw;
    try { raw = storage.getItem(PROFILE_STORAGE_KEY); }
    catch { throw fail('PROFILE_UNAVAILABLE', '개인 설정 저장소를 읽을 수 없어요. 입력한 설정은 유지됩니다.'); }
    if (raw === null) return null;
    try {
      const envelope = JSON.parse(raw);
      if (!envelope || envelope.schemaVersion !== 1 || !envelope.profile) throw new Error('Invalid profile envelope');
      const profile = normalizeProfile(envelope.profile);
      const storedShape = clone(profile);
      // Older v1 settings did not collect student status. Read with an unspecified
      // default, but never rewrite their bytes until the user explicitly saves.
      if (!Object.hasOwn(envelope.profile, 'studentStatus')) delete storedShape.studentStatus;
      if (JSON.stringify(storedShape) !== JSON.stringify(envelope.profile)) throw new Error('Invalid profile shape');
      return clone(profile);
    } catch { throw fail('PROFILE_CORRUPT', '저장된 개인 설정을 읽지 못해 보존했어요. 덮어쓰지 않고 이번 여행을 계속할 수 있어요.'); }
  }
  return {
    load,
    save(raw) {
      const profile = normalizeProfile(raw);
      load(); // Do not silently replace corrupt or unreadable stored information.
      const serialized = JSON.stringify({ schemaVersion: 1, profile });
      try {
        storage.setItem(PROFILE_STORAGE_KEY, serialized);
        if (storage.getItem(PROFILE_STORAGE_KEY) !== serialized) throw new Error('Read-back mismatch');
      } catch { throw fail('PROFILE_SAVE_FAILED', '개인 설정을 저장하지 못했어요. 입력은 유지되며 이번 여행을 계속할 수 있어요.'); }
      return clone(profile);
    },
    clear() {
      available();
      try {
        storage.removeItem(PROFILE_STORAGE_KEY);
        if (storage.getItem(PROFILE_STORAGE_KEY) !== null) throw new Error('Deletion did not persist');
      } catch { throw fail('PROFILE_DELETE_FAILED', '저장된 개인 설정을 지우지 못했어요. 다시 시도해 주세요.'); }
    },
  };
}
