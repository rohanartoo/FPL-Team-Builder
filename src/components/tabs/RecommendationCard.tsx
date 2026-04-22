import React from 'react';
import { ChipRecommendation } from '../../types';

/**
 * Premium card component to display a single chip recommendation.
 * Implements glassmorphism with subtle hover lift and micro‑animation.
 */
export const RecommendationCard: React.FC<{ rec: ChipRecommendation }> = ({ rec }) => {
  return (
    <div className="p-5 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 shadow-lg hover:shadow-xl transition-shadow duration-300">
      <h4 className="font-bold text-lg mb-2 text-white">{rec.chip}</h4>
      <p className="text-sm text-white/80">
        Best GW: <span className="font-mono text-white">{rec.bestGw}</span> (score{' '}
        <span className="font-mono text-white">{rec.bestScore.toFixed(1)}</span>)
      </p>
      <p className="text-xs text-white/60 mt-2">
        Alternatives:{' '}
        {rec.alternatives.map((a, i) => (
          <span key={i} className="font-mono text-white">
            GW{a.gw}{i < rec.alternatives.length - 1 ? ', ' : ''}
          </span>
        ))}
      </p>
    </div>
  );
};
