import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AuthContext, useAuth } from './AuthContext';
import { normalizeProfile } from '../utils/profileNormalizer';
import { isStaleActorError } from '../session/staleActor';

export const SignedInEAContext = createContext(null);
export const SignedInEAProvider = ({ handle, children }) => {
  const auth = useAuth();
  const [profile, setProfile] = useState(null);
  const services = handle.services;
  const refreshProfile = useCallback(async () => {
    try {
      const cached = await services.deviceProfile.get();
      if (!handle.isCurrent()) return;
      if (cached?.id === handle.userId) setProfile(normalizeProfile(cached));
      const network = await NetInfo.fetch();
      if (!network.isConnected || network.isInternetReachable === false || !handle.isCurrent()) return;
      const { data, error } = await handle.enqueueRequest(() => handle.dataClient
        .from('users').select('*, school_lookup:schools(id,name), job_title_lookup:job_titles(id,name,code)')
        .eq('id', handle.userId).single());
      if (error) throw error;
      if (data && handle.isCurrent()) {
        const normalized = normalizeProfile(data);
        await services.deviceProfile.save(normalized);
        if (handle.isCurrent()) setProfile(normalized);
      }
    } catch (error) {
      if (!isStaleActorError(error)) console.error('Error loading profile:', error);
    }
  }, [handle, services]);
  useEffect(() => {
    void refreshProfile();
    let active = true;
    let wasOnline = false;
    let receivedNetworkEvent = false;
    const refreshOnOnline = (network) => {
      if (!active || !handle.isCurrent()) return;
      const online = Boolean(network.isConnected && network.isInternetReachable !== false);
      if (online && !wasOnline) {
        void services.pullReferenceData().catch((error) => {
          if (!isStaleActorError(error)) console.error('Error refreshing reference data:', error);
        });
      }
      wasOnline = online;
    };
    const unsubscribe = NetInfo.addEventListener((network) => {
      receivedNetworkEvent = true;
      refreshOnOnline(network);
    });
    void NetInfo.fetch().then((network) => {
      if (!receivedNetworkEvent) refreshOnOnline(network);
    }).catch((error) => { if (!isStaleActorError(error)) console.error('Error checking startup connectivity:', error); });
    return () => { active = false; unsubscribe(); };
  }, [handle, services, refreshProfile]);
  const value = useMemo(() => ({ handle, repositories: handle.repositories, services }), [handle, services]);
  const profileAuth = useMemo(() => ({ ...auth, profile, refreshProfile }), [auth, profile, refreshProfile]);
  return <SignedInEAContext.Provider value={value}>
    <AuthContext.Provider value={profileAuth}>{children}</AuthContext.Provider>
  </SignedInEAContext.Provider>;
};
export const useSignedInEA = () => {
  const value = useContext(SignedInEAContext);
  if (!value) throw new Error('useSignedInEA must be used within a SignedInEAProvider');
  return value;
};
