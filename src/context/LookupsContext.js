import { isStaleActorError } from '../session/staleActor';
import { useSignedInEA } from './SignedInEAContext';
import React, { createContext, useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';

import { useAuth } from './AuthContext';
import { useOffline } from './OfflineContext';

const LookupsContext = createContext({});

export const LookupsProvider = ({ children }) => {
  const { repositories, services } = useSignedInEA();
  const { jobTitles: jobTitlesRepository } = repositories;

  const { user } = useAuth();
  const { isOnline } = useOffline();
  const [jobTitles, setJobTitles] = useState([]);
  const [loading, setLoading] = useState(false);
  const activeUserIdRef = useRef(null);

  const loadJobTitles = useCallback(async () => {
    const activeUserId = user?.id;
    try {
      setLoading(true);
      const cached = await jobTitlesRepository.getAll();
      if (activeUserIdRef.current !== activeUserId) return;
      setJobTitles(cached);

      try {
        if (!isOnline) return;
        const serverJobTitles = await services.pullLookups();
        if (activeUserIdRef.current !== activeUserId) return;
        setJobTitles(serverJobTitles);
      } catch (error) {
        if (isStaleActorError(error)) return;
        console.log('Could not fetch job titles from server (likely offline):', error.message);
      }
    } catch (error) {
      if (isStaleActorError(error)) return;
      console.error('Error in loadJobTitles:', error);
    } finally {
      if (activeUserIdRef.current === activeUserId) {
        setLoading(false);
      }
    }
  }, [user?.id, isOnline]);

  useEffect(() => {
    activeUserIdRef.current = user?.id || null;
    if (user?.id) {
      loadJobTitles();
    } else {
      setJobTitles([]);
    }
  }, [user?.id, loadJobTitles]);

  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (!prevOnlineRef.current && isOnline && user?.id) {
      loadJobTitles();
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, user?.id, loadJobTitles]);

  const value = useMemo(
    () => ({ jobTitles, loading, loadJobTitles }),
    [jobTitles, loading, loadJobTitles]
  );

  return (
    <LookupsContext.Provider value={value}>
      {children}
    </LookupsContext.Provider>
  );
};

export const useLookupsContext = () => {
  const context = useContext(LookupsContext);
  if (!context) {
    throw new Error('useLookupsContext must be used within a LookupsProvider');
  }
  return context;
};
