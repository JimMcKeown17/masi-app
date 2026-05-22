import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { enqueueSupabaseRequest } from '../services/supabaseRequestQueue';
import { storage } from '../utils/storage';
import { useAuth } from './AuthContext';
import { useOffline } from './OfflineContext';

const LookupsContext = createContext({});

export const LookupsProvider = ({ children }) => {
  const { user } = useAuth();
  const { isOnline } = useOffline();
  const [jobTitles, setJobTitles] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadJobTitles();
    } else {
      setJobTitles([]);
    }
  }, [user?.id]);

  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (!prevOnlineRef.current && isOnline && user?.id) {
      loadJobTitles();
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, user?.id]);

  const loadJobTitles = async () => {
    try {
      setLoading(true);
      const cached = await storage.getJobTitles();
      setJobTitles(cached);

      try {
        const { data, error } = await enqueueSupabaseRequest(() => (
          supabase
            .from('job_titles')
            .select('*')
            .order('sort_order', { ascending: true })
        ));

        if (error) throw error;
        const serverJobTitles = data || [];
        await storage.saveJobTitles(serverJobTitles);
        setJobTitles(serverJobTitles);
      } catch (error) {
        console.log('Could not fetch job titles from server (likely offline):', error.message);
      }
    } catch (error) {
      console.error('Error in loadJobTitles:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LookupsContext.Provider value={{ jobTitles, loading, loadJobTitles }}>
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
