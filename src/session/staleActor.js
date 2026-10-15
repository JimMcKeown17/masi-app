// src/session/staleActor.js
export class StaleActorError extends Error {
  constructor(message = 'Work belongs to a signed-out EA') {
    super(message);
    this.name = 'StaleActorError';
    this.code = 'STALE_ACTOR';
  }
}

// An open handle without a usable session (offline restore, refresh in flight). Reported to
// application code as the existing codeless network error so the row stays retriable.
export class AuthUnavailableError extends Error {
  constructor(message = 'auth unavailable') {
    super(message);
    this.name = 'AuthUnavailableError';
    this.code = '';
  }
}

export class FileOwnerMismatchError extends Error {
  constructor(expectedUserId, recordedUserId) {
    super(`Database file belongs to ${recordedUserId}, not ${expectedUserId}`);
    this.name = 'FileOwnerMismatchError';
    this.code = 'FILE_OWNER_MISMATCH';
  }
}

export class NoSignedInEAError extends Error {
  constructor(message = 'No EA is signed in') {
    super(message);
    this.name = 'NoSignedInEAError';
    this.code = 'NO_SIGNED_IN_EA';
  }
}

export const isStaleActorError = (error) => error instanceof StaleActorError
  || error?.name === 'StaleActorError';

export class HandleDisposeFailedError extends Error {
  constructor(message = 'Database connections could not be disposed safely') {
    super(message);
    this.name = 'HandleDisposeFailedError';
    this.code = 'HANDLE_DISPOSE_FAILED';
  }
}

export class UnboundRepositoryError extends Error {
  constructor(message = 'Repository requires a signed-in EA handle') {
    super(message);
    this.name = 'UnboundRepositoryError';
    this.code = 'UNBOUND_REPOSITORY';
  }
}
