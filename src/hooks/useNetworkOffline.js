import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function isDefinitelyOffline(state) {
  return state?.isConnected === false || state?.isInternetReachable === false;
}

// Signed-in screens keep useOffline(): OfflineContext deliberately treats
// isConnected: null as offline. Here unknown means online to avoid a launch flash.
export function useNetworkOffline() {
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((state) => {
    setOffline(isDefinitelyOffline(state));
  }), []);
  return offline;
}
