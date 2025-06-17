import React from 'react';
import './LoadingOverlay.css';

interface LoadingOverlayProps {
  isVisible: boolean;
  latestActivity?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ 
  isVisible, 
  latestActivity 
}) => {
  if (!isVisible) return null;

  return (
    <div className="loading-overlay">
      <div className="loading-content">
        <div className="spinner"></div>
        <p className="loading-text">Verwerken van scan...</p>
        {latestActivity && (
          <div className="latest-activity">
            <p className="activity-label">Laatste activiteit:</p>
            <p className="activity-text">{latestActivity}</p>
          </div>
        )}
      </div>
    </div>
  );
};
