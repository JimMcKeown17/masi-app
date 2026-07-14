import { classesRepository } from './classesRepository';
import { localStateRepository } from './localStateRepository';
import { runRepositoryTransaction } from './repositoryRuntime';

const pendingClassKey = (userId) => `class_onboarding:${userId}`;

export const createClassOnboardingRepository = ({
  database,
  classes = classesRepository,
  localState = localStateRepository,
} = {}) => {
  const getPendingClassId = async (userId) => {
    if (!userId) return null;
    const state = await localState.get(pendingClassKey(userId), null);
    return state?.classId || null;
  };

  const start = async ({ userId, classData }) => {
    if (!userId) throw new Error('A user is required to start class onboarding');
    if (!classData?.id) throw new Error('A class is required to start class onboarding');

    await runRepositoryTransaction(database, async (transaction) => {
      await classes.saveClass(classData, { transaction });
      await localState.set(
        pendingClassKey(userId),
        { classId: classData.id },
        { transaction }
      );
    });
    return true;
  };

  const complete = async ({ userId, classId }) => {
    const pendingClassId = await getPendingClassId(userId);
    if (!pendingClassId || pendingClassId !== classId) return false;
    await localState.remove(pendingClassKey(userId));
    return true;
  };

  return { start, getPendingClassId, complete };
};

export const classOnboardingRepository = createClassOnboardingRepository();
