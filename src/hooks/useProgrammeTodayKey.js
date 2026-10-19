import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { toLocalDateString } from '../utils/localDate';

const currentKey = () => toLocalDateString(new Date());

// The programme day (SAST) as a YYYY-MM-DD key that stays current while a screen is open:
// it rechecks every minute and whenever the app returns to the foreground. Setting the same
// string again does not re-render.
export function useProgrammeTodayKey() {
  const [key, setKey] = useState(currentKey);
  useEffect(() => {
    const refresh = () => setKey(currentKey());
    const timer = setInterval(refresh, 60 * 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  return key;
}
