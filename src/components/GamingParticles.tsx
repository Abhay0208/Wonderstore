import React, { useMemo } from 'react';
import { useStoreConfig } from '../context/StoreConfigContext';
import { StoreThemeId } from '../types';
import { resolveFloatingEmojiConfig } from '../utils/floatingEmojiHelpers';

interface ParticleItem {
  left: string;
  size: number;
  baseDuration: number;
  delay: number;
  drift: number;
  opacity: number;
  charIndex: number;
}

const FIREWORK_POSITIONS = [
  { top: '12%', left: '12%', delay: '0s' },
  { top: '18%', left: '78%', delay: '1.4s' },
  { top: '42%', left: '8%', delay: '2.6s' },
  { top: '34%', left: '84%', delay: '0.7s' },
];

const RAMADAN_LANTERNS = [
  { left: '6vw', top: '-10px', height: '110px', delay: '0s', sway: 'sway-slow' },
  { left: '16vw', top: '-10px', height: '85px', delay: '0.8s', sway: 'sway-mid' },
  { right: '16vw', top: '-10px', height: '95px', delay: '1.5s', sway: 'sway-slow' },
  { right: '6vw', top: '-10px', height: '120px', delay: '0.4s', sway: 'sway-fast' },
];

const RAMADAN_TWINKLE_STARS = [
  { left: '10%', top: '15%', delay: '0s', size: '12px' },
  { left: '25%', top: '22%', delay: '1.2s', size: '16px' },
  { left: '40%', top: '12%', delay: '2.1s', size: '14px' },
  { left: '60%', top: '18%', delay: '0.6s', size: '18px' },
  { left: '75%', top: '28%', delay: '1.8s', size: '13px' },
  { left: '88%', top: '14%', delay: '2.5s', size: '15px' },
];

function createStableParticlePool(count: number): ParticleItem[] {
  return Array.from({ length: count }).map((_, i) => {
    const seed = (i * 9301 + 49297) % 233280;
    const r1 = seed / 233280;
    const r2 = ((i * 7919 + 12345) % 233280) / 233280;
    const r3 = ((i * 3571 + 67891) % 233280) / 233280;
    return {
      left: (r1 * 97 + 1.5).toFixed(1) + '%',
      size: Math.floor(r2 * 14) + 12,
      baseDuration: Math.floor(r3 * 8) + 10,
      delay: -(r2 * 20),
      drift: Math.floor(r1 * 60) - 30,
      opacity: Number((r3 * 0.42 + 0.4).toFixed(2)),
      charIndex: i,
    };
  });
}

const MAX_PARTICLE_POOL = createStableParticlePool(44);

export const GamingParticles: React.FC = () => {
  const { effectiveTheme, themeSettings } = useStoreConfig();
  const activeTheme: StoreThemeId = effectiveTheme || 'winter';

  const floatingConfig = useMemo(
    () => resolveFloatingEmojiConfig(activeTheme, themeSettings),
    [activeTheme, themeSettings]
  );

  const visibleParticles = useMemo(() => {
    if (!floatingConfig.enabled) return [];
    return MAX_PARTICLE_POOL.slice(0, floatingConfig.particleCount);
  }, [floatingConfig.enabled, floatingConfig.particleCount]);

  const chars = floatingConfig.emojis;

  const auroraStyle: React.CSSProperties =
    activeTheme === 'christmas'
      ? {
          background:
            'radial-gradient(ellipse 90% 40% at 50% -10%, rgba(220, 38, 38, 0.25), rgba(22, 163, 74, 0.22) 50%, transparent 80%)',
        }
      : activeTheme === 'newyear2027'
      ? {
          background:
            'radial-gradient(ellipse 90% 40% at 50% -10%, rgba(245, 158, 11, 0.28), rgba(147, 51, 234, 0.24) 50%, transparent 80%)',
        }
      : activeTheme === 'ramadan'
      ? {
          background:
            'radial-gradient(ellipse 90% 40% at 50% -10%, rgba(16, 185, 129, 0.28), rgba(251, 191, 36, 0.22) 50%, transparent 80%)',
        }
      : {
          background:
            'radial-gradient(ellipse 90% 40% at 50% -10%, rgba(56, 189, 248, 0.22), rgba(2, 132, 199, 0.16) 50%, transparent 80%)',
        };

  return (
    <div
      data-testid="gaming-particles-layer"
      data-floating-emojis-enabled={floatingConfig.enabled ? 'true' : 'false'}
      data-floating-emojis={chars.join(',')}
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="aurora-curtain absolute top-0 left-0 right-0 h-[38vh] pointer-events-none"
        style={auroraStyle}
      />

      <div className="winter-fog absolute -left-1/2 -bottom-[8vh] w-[200%] h-[35vh] pointer-events-none" />
      <div className="winter-fog winter-fog-two absolute -left-1/2 -bottom-[14vh] w-[200%] h-[35vh] pointer-events-none opacity-70" />

      {/* New Year 2027 Fireworks */}
      {activeTheme === 'newyear2027' &&
        FIREWORK_POSITIONS.map((fw, idx) => (
          <div
            key={`firework-${idx}`}
            className="firework-burst"
            style={{ top: fw.top, left: fw.left, animationDelay: fw.delay }}
          />
        ))}

      {/* Ramadan Theme Hanging Lanterns & Twinkling Stars */}
      {activeTheme === 'ramadan' && (
        <>
          {/* Hanging Lanterns */}
          {RAMADAN_LANTERNS.map((lantern, idx) => (
            <div
              key={`ramadan-lantern-${idx}`}
              className="absolute pointer-events-none hidden sm:flex flex-col items-center"
              style={{
                left: lantern.left,
                right: lantern.right,
                top: lantern.top,
                animation: `ramadan-lantern-swing 4.5s ease-in-out infinite alternate ${lantern.delay}`,
                transformOrigin: 'top center',
              }}
            >
              {/* String */}
              <div
                className="w-[1.5px] bg-gradient-to-b from-amber-200/80 to-amber-400/90 shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                style={{ height: lantern.height }}
              />
              {/* Lantern icon with warm golden glow */}
              <div className="relative -mt-1 text-2xl select-none filter drop-shadow-[0_0_15px_rgba(251,191,36,0.95)] animate-[ramadan-lantern-glow_3s_ease-in-out_infinite_alternate]">
                🪔
              </div>
            </div>
          ))}

          {/* Twinkling Stars */}
          {RAMADAN_TWINKLE_STARS.map((star, idx) => (
            <span
              key={`ramadan-star-${idx}`}
              className="absolute pointer-events-none text-amber-200 select-none animate-[ramadan-star-twinkle_2.5s_ease-in-out_infinite_alternate]"
              style={{
                left: star.left,
                top: star.top,
                fontSize: star.size,
                animationDelay: star.delay,
                filter: 'drop-shadow(0 0 8px rgba(253, 224, 71, 0.8))',
              }}
            >
              ✦
            </span>
          ))}
        </>
      )}

      {/* Falling / Floating Background Emojis */}
      {visibleParticles.map((s, idx) => (
        <span
          key={`particle-${idx}`}
          className="winter-snowflake"
          style={
            {
              left: s.left,
              fontSize: `${s.size}px`,
              opacity: s.opacity,
              animationDuration: `${(s.baseDuration * floatingConfig.durationMultiplier).toFixed(2)}s`,
              animationDelay: `${s.delay.toFixed(2)}s`,
              '--drift': `${s.drift}px`,
            } as React.CSSProperties
          }
        >
          {chars[s.charIndex % chars.length]}
        </span>
      ))}
    </div>
  );
};
