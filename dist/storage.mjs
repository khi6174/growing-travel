import { DomainError, validateCourseDraft } from './travel-domain.mjs';

export const STORAGE_KEY = 'growing-travel.local-demo.v1';
const LOCK_KEY = `${STORAGE_KEY}.write`;
const copy = (value) => JSON.parse(JSON.stringify(value));
const validDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));

function validateCourse(course) {
  if (!course || typeof course.id !== 'string' || !course.id || !Number.isInteger(course.version) || course.version < 1 || !validDate(course.savedAt)) throw new Error('Invalid course metadata');
  validateCourseDraft(course);
}

export function createCourseStore(options = {}) {
  let storage;
  let storageError;
  try { storage = Object.hasOwn(options, 'storage') ? options.storage : globalThis.localStorage; }
  catch (error) { storageError = error; }
  const withLock = options.withLock ?? (async (action) => {
    if (!globalThis.navigator?.locks?.request) throw new DomainError('SAVE_FAILED', '이 브라우저는 안전한 동시 저장을 지원하지 않아요. 최신 Chrome 또는 Edge에서 로컬 주소로 열어 주세요.');
    return globalThis.navigator.locks.request(LOCK_KEY, action);
  });
  function read() {
    let raw;
    try {
      if (storageError || !storage || typeof storage.getItem !== 'function') throw storageError ?? new Error('Unavailable storage');
      raw = storage.getItem(STORAGE_KEY);
    } catch { throw new DomainError('STORAGE_UNAVAILABLE', '브라우저 저장소를 읽을 수 없어요. 저장 권한이나 비공개 모드 설정을 확인해 주세요.'); }
    if (raw === null) return { schemaVersion: 1, courses: [], requests: [] };
    try {
      const state = JSON.parse(raw);
      if (!state || state.schemaVersion !== 1 || !Array.isArray(state.courses) || !Array.isArray(state.requests)) throw new Error('Invalid envelope');
      const courseIds = new Set();
      for (const course of state.courses) {
        validateCourse(course);
        if (courseIds.has(course.id)) throw new Error('Duplicate course');
        courseIds.add(course.id);
      }
      const requestKeys = new Set();
      for (const request of state.requests) {
        if (!request || typeof request.key !== 'string' || typeof request.signature !== 'string' || !request.result || !courseIds.has(request.result.id) || requestKeys.has(request.key)) throw new Error('Invalid request history');
        validateCourse(request.result);
        requestKeys.add(request.key);
      }
      return state;
    } catch { throw new DomainError('STORAGE_CORRUPT', '저장된 코스 자료를 읽을 수 없어 덮어쓰지 않았어요. 기존 브라우저 자료를 보존한 상태로 확인이 필요해요.'); }
  }
  return {
    async list() { return copy(read().courses).sort((a, b) => b.savedAt.localeCompare(a.savedAt)); },
    async get(id) { return copy(read().courses.find((course) => course.id === id) ?? null); },
    async save({ draft, courseId, expectedVersion, clientSaveKey, acknowledgeWarnings = false }) {
      const validated = validateCourseDraft(draft);
      if (validated.estimate.warnings.length && acknowledgeWarnings !== true) throw new DomainError('WARNINGS_NOT_ACKNOWLEDGED', '이동 시간과 운영정보가 미확인인 초안임을 확인해 주세요.');
      if (typeof clientSaveKey !== 'string' || !clientSaveKey || clientSaveKey.length > 120) throw new DomainError('INVALID_COURSE', '저장 요청을 다시 만들어 주세요.');
      const signature = JSON.stringify({ draft: validated, courseId: courseId ?? null, expectedVersion: expectedVersion ?? null });
      return withLock(async () => {
        const state = read();
        const previousRequest = state.requests.find((request) => request.key === clientSaveKey);
        if (previousRequest) {
          if (previousRequest.signature !== signature) throw new DomainError('VERSION_CONFLICT', '같은 저장 요청의 내용이 달라졌어요. 초안을 유지하고 다시 저장해 주세요.');
          return copy(previousRequest.result);
        }
        const existing = courseId ? state.courses.find((course) => course.id === courseId) : null;
        if (courseId && (!existing || existing.version !== expectedVersion)) throw new DomainError('VERSION_CONFLICT', '다른 탭에서 코스가 바뀌었어요. 현재 초안은 유지됩니다. 저장된 최신 코스를 다시 열어 확인해 주세요.');
        if (!courseId && expectedVersion !== undefined && expectedVersion !== null) throw new DomainError('VERSION_CONFLICT', '새 코스에는 수정 버전을 지정할 수 없어요.');
        const id = existing?.id ?? globalThis.crypto.randomUUID();
        const course = { ...validated, id, version: existing ? existing.version + 1 : 1, savedAt: new Date().toISOString() };
        if (existing) state.courses = state.courses.map((item) => item.id === id ? course : item);
        else state.courses.push(course);
        state.requests.push({ key: clientSaveKey, signature, result: course });
        let serialized;
        try {
          serialized = JSON.stringify(state);
          storage.setItem(STORAGE_KEY, serialized);
          if (storage.getItem(STORAGE_KEY) !== serialized) throw new Error('Read-back mismatch');
        } catch { throw new DomainError('SAVE_FAILED', '저장하지 못했어요. 초안은 유지됩니다. 브라우저 저장 공간과 권한을 확인한 뒤 다시 시도해 주세요.'); }
        return copy(course);
      });
    },
  };
}
