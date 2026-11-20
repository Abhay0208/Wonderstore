import React, { useEffect, useState, useRef } from 'react';
import { useStoreConfig } from '../context/StoreConfigContext';
import type { StoreThemeId } from '../types';
import {
  type ClickAnimationConfig,
  type GeneratedClickParticle,
  DEFAULT_CLICK_CONFIGS,
  getClickVisualStyle,
  generateClickParticles,
} from '../utils/clickAnimationHelpers';

export type { ClickAnimationConfig };
export { DEFAULT_CLICK_CONFIGS };

interface ClickExplosion {
  id: string;
  x: number;
  y: number;
  themeId: StoreThemeId;
  mainEmoji: string;
  particles: GeneratedClickParticle[];
  config: ClickAnimationConfig;
}

export const DynamicClickEffect: React.FC = () => {
  const { effectiveTheme } = useStoreConfig();
  const [animationsMap, setAnimationsMap] = useState<Record<StoreThemeId, ClickAnimationConfig>>(
    DEFAULT_CLICK_CONFIGS
  );
  const [explosions, setExplosions] = useState<ClickExplosion[]>([]);
  const lastClickTimeRef = useRef<number>(0);

  useEffect(() => {
    const loadAnimations = () => {
      fetch('/api/click-animations')
        .then((res) => res.json())
        .then((data) => {
          if (data && data.animations && typeof data.animations === 'object') {
            setAnimationsMap({ ...DEFAULT_CLICK_CONFIGS, ...data.animations });
          }
        })
        .catch(() => {
          // fallback to defaults
        });
    };

    const handleUpdatedEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent?.detail?.animations && typeof customEvent.detail.animations === 'object') {
        setAnimationsMap({ ...DEFAULT_CLICK_CONFIGS, ...customEvent.detail.animations });
      } else {
        loadAnimations();
      }
    };

    loadAnimations();

    window.addEventListener('storage', loadAnimations);
    window.addEventListener('wonder:click-animations-updated', handleUpdatedEvent);
    return () => {
      window.removeEventListener('storage', loadAnimations);
      window.removeEventListener('wonder:click-animations-updated', handleUpdatedEvent);
    };
  }, []);

  const currentThemeId: StoreThemeId = effectiveTheme || 'default';
  const activeConfig =
    animationsMap[currentThemeId] ||
    DEFAULT_CLICK_CONFIGS[currentThemeId] ||
    DEFAULT_CLICK_CONFIGS.default;
  const activeThemeEnabled = Boolean(activeConfig.enabled);

  useEffect(() => {
    if (!activeThemeEnabled) {
      setExplosions([]);
    }
  }, [activeThemeEnabled]);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }

      // Prevent duplicate rapid-fire triggers within 50ms
      const now = Date.now();
      if (now - lastClickTimeRef.current < 50) return;
      lastClickTimeRef.current = now;

      const themeId: StoreThemeId = effectiveTheme || 'default';
      const currentCfg =
        animationsMap[themeId] ||
        DEFAULT_CLICK_CONFIGS[themeId] ||
        DEFAULT_CLICK_CONFIGS.default;
      if (!currentCfg.enabled) return;

      // Do not block interactive buttons, links, inputs, or text areas
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'BUTTON' ||
          target.tagName === 'A' ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.closest('button') ||
          target.closest('a') ||
          target.closest('input') ||
          target.closest('textarea') ||
          target.closest('[role="button"]'))
      ) {
        return;
      }

      let clientX = 0;
      let clientY = 0;

      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
      } else {
        return;
      }

      const particles = generateClickParticles(currentCfg, themeId);

      const explosion: ClickExplosion = {
        id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        x: clientX,
        y: clientY,
        themeId,
        mainEmoji: currentCfg.emoji || DEFAULT_CLICK_CONFIGS[themeId].emoji,
        particles,
        config: currentCfg,
      };

      setExplosions((prev) => [...prev.slice(-10), explosion]);

      const durationMs = Number(currentCfg.duration) || 700;
      setTimeout(() => {
        setExplosions((prev) => prev.filter((item) => item.id !== explosion.id));
      }, durationMs + 160);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [animationsMap, effectiveTheme]);

  return (
    <div
      data-testid="click-effect-layer"
      data-click-animations-enabled={activeThemeEnabled ? 'true' : 'false'}
      className="fixed inset-0 pointer-events-none z-[999999] overflow-hidden"
      aria-hidden="true"
    >
      {explosions.map((exp) => {
        const durationSec = (exp.config.duration || 700) / 1000;
        const endOpacity = exp.config.fade ? '0' : '0.9';
        const styleMeta = getClickVisualStyle(exp.config, exp.themeId);
        const isWinterSnowflake =
          exp.config.animationType === 'snowflake' || exp.config.emoji === '❄️';
        const useSpinBlast = isWinterSnowflake || (exp.config.rotation && styleMeta.symmetricalSpin);
        const rotDeg = exp.config.rotation ? '360deg' : '0deg';
        const midRotDeg = exp.config.rotation ? '180deg' : '0deg';
        const heroFontSize =
          exp.config.size === 'small' ? '20px' : exp.config.size === 'large' ? '34px' : '26px';

        return (
          <div
            key={exp.id}
            className="absolute left-0 top-0 pointer-events-none"
            style={{ transform: `translate(${exp.x}px, ${exp.y}px)` }}
          >
            {/* Expanding glow halo ring */}
            <span
              className="absolute left-0 top-0 rounded-full pointer-events-none"
              style={{
                width: styleMeta.showFireworkRing ? '88px' : '64px',
                height: styleMeta.showFireworkRing ? '88px' : '64px',
                border: styleMeta.showFireworkRing ? 'none' : `2px solid ${styleMeta.ringColor}`,
                boxShadow: styleMeta.showFireworkRing
                  ? 'none'
                  : `0 0 18px ${styleMeta.ringColor}`,
                background: styleMeta.showFireworkRing
                  ? `radial-gradient(circle, rgba(253, 224, 71, 0.72) 0%, transparent 45%),
                     repeating-conic-gradient(from 0deg, rgba(251, 191, 36, 0.85) 0deg 6deg, transparent 6deg 24deg),
                     repeating-conic-gradient(from 12deg, rgba(168, 85, 247, 0.85) 0deg 6deg, transparent 6deg 24deg)`
                  : undefined,
                maskImage: styleMeta.showFireworkRing
                  ? 'radial-gradient(circle, transparent 18%, black 28%, black 58%, transparent 74%)'
                  : undefined,
                WebkitMaskImage: styleMeta.showFireworkRing
                  ? 'radial-gradient(circle, transparent 18%, black 28%, black 58%, transparent 74%)'
                  : undefined,
                  animation: `${
                    styleMeta.showFireworkRing ? 'clickFireworkBurstRing' : 'clickRippleRing'
                  } ${Math.min(0.68, durationSec * 0.82)}s cubic-bezier(0.16, 1, 0.3, 1) both`,
                }}
              />

            {/* Main center hero emoji */}
            <span
              className="absolute select-none leading-none"
              style={
                {
                  '--glow-color': styleMeta.glowColor,
                  '--blast-mid-rot': midRotDeg,
                  '--blast-rot': rotDeg,
                  '--end-opacity': endOpacity,
                  fontSize: heroFontSize,
                  animation: useSpinBlast
                    ? `snowflakeBlast ${durationSec}s cubic-bezier(0.16, 1, 0.3, 1) both`
                    : `clickHeroFloat ${durationSec}s cubic-bezier(0.22, 1, 0.36, 1) both`,
                } as React.CSSProperties
              }
            >
              {exp.mainEmoji}
            </span>

            {/* Companion & outer burst particles */}
            {exp.particles.map((p) => (
              <span
                key={p.id}
                className="absolute select-none leading-none"
                style={
                  {
                    '--dx': `${p.dx}px`,
                    '--dy': `${p.dy}px`,
                    '--mid-rot': `${p.midRotate}deg`,
                    '--rot': `${p.rotate}deg`,
                    '--end-opacity': endOpacity,
                    fontSize: `${p.sizePx}px`,
                    filter: `drop-shadow(0 0 8px ${styleMeta.glowColor})`,
                    animation: isWinterSnowflake
                      ? `particleFly ${durationSec}s ease-out both`
                      : `clickParticleGlide ${durationSec}s cubic-bezier(0.16, 1, 0.3, 1) both`,
                  } as React.CSSProperties
                }
              >
                {p.emoji}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export const PumpkinClickEffect = DynamicClickEffect;
export const WinterClickEffect = DynamicClickEffect;
