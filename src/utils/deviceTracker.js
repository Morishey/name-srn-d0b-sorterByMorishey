// 1. Create this file: src/utils/deviceTracker.js
import { useEffect } from 'react';

// Device detection logic
export const detectDevice = () => {
  if (typeof window === 'undefined') return 'Unknown';
  
  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /iphone|ipad|ipod|android|blackberry|windows phone/g.test(ua);
  const isTablet = /(ipad|tablet|playbook|silk)|(android(?!.*mobile))/g.test(ua);
  
  if (isMobile) return 'Mobile';
  if (isTablet) return 'Tablet';
  return 'Desktop';
};

// Generate a unique visitor ID (stores in localStorage)
export const getVisitorId = () => {
  if (typeof window === 'undefined') return null;
  
  let visitorId = localStorage.getItem('mosort_pro_visitor_id');
  
  if (!visitorId) {
    // Generate a random ID
    visitorId = 'visitor_' + Math.random().toString(36).substring(2) + 
                '_' + Date.now().toString(36);
    localStorage.setItem('mosort_pro_visitor_id', visitorId);
  }
  
  return visitorId;
};

// Simple in-memory storage for visits (for demo)
// In production, replace with API call to your backend
const localVisits = {
  total: 0,
  byDevice: { Mobile: 0, Tablet: 0, Desktop: 0 },
  visitors: new Set()
};

// Main tracking hook - add this to your App component
export const useVisitorTracking = () => {
  useEffect(() => {
    // Only track on client side
    if (typeof window === 'undefined') return;
    
    const trackVisit = () => {
      const device = detectDevice();
      const visitorId = getVisitorId();
      
      // Store visit locally
      localVisits.total++;
      localVisits.byDevice[device] = (localVisits.byDevice[device] || 0) + 1;
      localVisits.visitors.add(visitorId);
      
      // Log to console (replace with API call in production)
      console.log('📊 Visit tracked:', {
        device,
        visitorId,
        totalVisits: localVisits.total,
        uniqueVisitors: localVisits.visitors.size,
        deviceBreakdown: localVisits.byDevice
      });
      
      // Save to localStorage for persistence across refreshes
      localStorage.setItem('mosort_pro_stats', JSON.stringify({
        total: localVisits.total,
        byDevice: localVisits.byDevice,
        lastVisit: new Date().toISOString()
      }));
    };
    
    // Track the visit
    trackVisit();
    
    // Optional: Track additional events
    const trackFileUpload = () => {
      const device = detectDevice();
      console.log(`📁 File upload from ${device} device`);
      // Add to your handleFile function
    };
    
    const trackFileSort = () => {
      const device = detectDevice();
      console.log(`⚡ File sort executed from ${device} device`);
      // Add to your sortFile function
    };
    
    // Return cleanup if needed
    return () => {};
  }, []);
};

// Function to get current statistics
export const getStats = () => {
  if (typeof window === 'undefined') return null;
  
  const saved = localStorage.getItem('mosort_pro_stats');
  if (saved) {
    return JSON.parse(saved);
  }
  
  return {
    total: 0,
    byDevice: { Mobile: 0, Tablet: 0, Desktop: 0 },
    lastVisit: null
  };
};