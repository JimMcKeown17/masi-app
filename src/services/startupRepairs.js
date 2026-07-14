import { createLocalStateRepository, localStateRepository } from '../db/repositories/localStateRepository';
import { repairGroupOwnershipForSync } from '../db/repositories/groupsRepository';

export const STARTUP_REPAIR_MARKER_KEY = 'startup_repair_version';

const defaultRepairs = [
  {
    version: 1,
    name: 'group_ownership_cutover',
    run: ({ database }) => repairGroupOwnershipForSync({ database }),
  },
];

export const STARTUP_REPAIR_VERSION = defaultRepairs[defaultRepairs.length - 1].version;

const validateRepairs = (repairs) => {
  let previousVersion = 0;
  const names = new Set();
  for (const repair of repairs) {
    if (!Number.isInteger(repair?.version) || repair.version <= previousVersion) {
      throw new Error('Startup repair versions must be positive and strictly increasing');
    }
    if (!repair.name || names.has(repair.name)) {
      throw new Error('Startup repair names must be present and unique');
    }
    if (typeof repair.run !== 'function') {
      throw new Error(`Startup repair ${repair.name} must provide a run function`);
    }
    previousVersion = repair.version;
    names.add(repair.name);
  }
};

export const createStartupRepairRunner = ({
  database,
  localStateRepository: stateRepository = database
    ? createLocalStateRepository({ database })
    : localStateRepository,
  repairs = defaultRepairs,
} = {}) => {
  validateRepairs(repairs);

  const run = async () => {
    const storedVersion = Number(
      await stateRepository.get(STARTUP_REPAIR_MARKER_KEY, 0)
    );
    const fromVersion = Number.isFinite(storedVersion) && storedVersion >= 0
      ? storedVersion
      : 0;
    let completedVersion = fromVersion;
    const applied = [];

    for (const repair of repairs) {
      if (repair.version <= completedVersion) continue;

      // Each recipe must be idempotent. The repair commits first and its marker follows, so a kill
      // between those writes reruns safe work instead of falsely recording unfinished repair.
      try {
        await repair.run({ database });
      } catch (cause) {
        const causeMessage = cause instanceof Error ? cause.message : String(cause);
        const error = new Error(
          `Startup repair v${repair.version} (${repair.name}) failed: ${causeMessage}`
        );
        error.cause = cause;
        error.repairVersion = repair.version;
        error.repairName = repair.name;
        error.completedVersion = completedVersion;
        throw error;
      }
      await stateRepository.set(STARTUP_REPAIR_MARKER_KEY, repair.version);
      completedVersion = repair.version;
      applied.push(repair.name);
    }

    return {
      success: true,
      fromVersion,
      toVersion: completedVersion,
      applied,
    };
  };

  return { run };
};

const defaultRunner = createStartupRepairRunner();

export const runStartupRepairs = async () => {
  const result = await defaultRunner.run();
  if (result.applied.length > 0) {
    console.log(
      `Startup repair: advanced to v${result.toVersion} (${result.applied.join(', ')})`
    );
  }
  return result;
};
