import React, { useState, useEffect, useRef } from 'react';
import { StoreThemeId } from '../../types';
import { STORE_THEME_LIST, getThemeMeta } from '../../utils/categoryTheme';
import { useToast } from '../../context/ToastContext';
import { Sparkles, Play, RotateCcw, Save, Wand2, Power } from 'lucide-react';
import { FloatingEmojiCustomizer } from './FloatingEmojiCustomizer';
import {
  type ClickAnimationConfig,
  type GeneratedClickParticle,
  ANIMATION_PRESETS,
  DEFAULT_CLICK_CONFIGS,
  getClickVisualStyle,
  generateClickParticles,
  setAllClickAnimationsEnabled,
  setThemeClickAnimationEnabled,
  getClickAnimationsEnabledSummary,
} from '../../utils/clickAnimationHelpers';

export { ANIMATION_PRESETS };

interface AdminClickAnimationTabProps {
  onLogActivity?: (action: string, details: string, type?: 'settings' | 'other', adminName?: string) => void;
  adminName?: string;
}

export const AdminClickAnimationTab: React.FC<AdminClickAnimationTabProps> = ({
  onLogActivity,
  adminName,
}) => {
  const [animations, setAnimations] = useState<Record<StoreThemeId, ClickAnimationConfig>>(DEFAULT_CLICK_CONFIGS);
  const [activeTabTheme, setActiveTabTheme] = useState<StoreThemeId>('ramadan');
  const [customEmojiInput, setCustomEmojiInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [previewBurst, setPreviewBurst] = useState<{
    key: number;
    particles: GeneratedClickParticle[];
  } | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const { success, error: toastError } = useToast();

  useEffect(() => {
    return () => {
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    fetch('/api/click-animations')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.animations) {
          setAnimations({ ...DEFAULT_CLICK_CONFIGS, ...data.animations });
        }
      })
      .catch(() => {});
  }, []);

  const currentConfig = animations[activeTabTheme] || DEFAULT_CLICK_CONFIGS[activeTabTheme];
  const enabledSummary = getClickAnimationsEnabledSummary(animations);

  const persistAnimations = async (
    nextAnimations: Record<StoreThemeId, ClickAnimationConfig>,
    toastMessage: string,
    auditDetails: string
  ) => {
    setIsSaving(true);
    try {
      const token =
        sessionStorage.getItem('wondermc_support_staff_token') ||
        sessionStorage.getItem('wondermc_admin_auth_token') ||
        '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-admin-key'] = token;
      }

      const res = await fetch('/api/admin/click-animations', {
        method: 'PUT',
        headers,
        body: JSON.stringify(nextAnimations),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save click animations.');

      setAnimations(data.animations);
      window.dispatchEvent(
        new CustomEvent('wonder:click-animations-updated', {
          detail: { animations: data.animations },
        })
      );
      onLogActivity?.('Click Animations Updated', auditDetails, 'settings', adminName);
      success(toastMessage);
    } catch (err: any) {
      toastError(err.message || 'Failed to save click animations.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateCurrentConfig = (partial: Partial<ClickAnimationConfig>) => {
    setAnimations((prev) => ({
      ...prev,
      [activeTabTheme]: {
        ...(prev[activeTabTheme] || DEFAULT_CLICK_CONFIGS[activeTabTheme]),
        ...partial,
      },
    }));
  };

  const handleToggleAllThemes = async (enabled: boolean) => {
    const next = setAllClickAnimationsEnabled(animations, enabled);
    setAnimations(next);
    await persistAnimations(
      next,
      enabled
        ? 'Click emoji animations enabled for ALL 5 themes!'
        : 'Click emoji animations disabled for ALL 5 themes!',
      enabled
        ? 'Enabled click emoji animations across all 5 storefront themes'
        : 'Disabled click emoji animations across all 5 storefront themes'
    );
  };

  const handleQuickToggleTheme = async (themeId: StoreThemeId) => {
    const current = animations[themeId]?.enabled ?? true;
    const nextEnabled = !current;
    const next = setThemeClickAnimationEnabled(animations, themeId, nextEnabled);
    setAnimations(next);
    const meta = getThemeMeta(themeId);
    await persistAnimations(
      next,
      `${meta.emoji} ${meta.shortLabel} click animation ${nextEnabled ? 'enabled' : 'disabled'}!`,
      `${nextEnabled ? 'Enabled' : 'Disabled'} click animation for ${meta.label}`
    );
  };

  const handleSelectPreset = (presetId: string, emoji: string) => {
    updateCurrentConfig({
      animationType: presetId,
      emoji,
    });
  };

  const handleApplyCustomEmoji = () => {
    if (!customEmojiInput.trim()) return;
    updateCurrentConfig({
      emoji: customEmojiInput.trim().slice(0, 8),
      animationType: 'custom',
    });
    setCustomEmojiInput('');
    success('Custom emoji applied successfully!');
  };

  const handleSave = async () => {
    await persistAnimations(
      animations,
      'Click animation settings saved successfully to central database!',
      'Updated click animation settings for storefront themes'
    );
  };

  const handleResetTheme = () => {
    const def = DEFAULT_CLICK_CONFIGS[activeTabTheme];
    setAnimations((prev) => ({
      ...prev,
      [activeTabTheme]: { ...def },
    }));
    success(`Reset ${activeTabTheme} theme click animation to default.`);
  };

  const triggerLivePreview = () => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
    }
    const cfg = animations[activeTabTheme] || DEFAULT_CLICK_CONFIGS[activeTabTheme];
    const particles = generateClickParticles(cfg, activeTabTheme);
    setPreviewBurst({ key: Date.now(), particles });
    previewTimerRef.current = window.setTimeout(() => {
      setPreviewBurst(null);
      previewTimerRef.current = null;
    }, Math.max(950, (cfg.duration || 700) + 250));
  };

  const activeThemeMeta = getThemeMeta(activeTabTheme);

  return (
    <div className="space-y-6">
      {/* Header & Description */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border bg-surface-deep p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent border border-accent/30">
            <Wand2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-foreground font-display">
              Click Animation Settings
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enable or disable click emoji animations across all themes or customize each theme independently.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetTheme}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-black uppercase tracking-wider text-foreground hover:border-accent hover:text-accent transition-colors cursor-pointer min-h-[44px]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Theme</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-black uppercase tracking-wider text-accent-foreground hover:opacity-90 shadow-md cursor-pointer disabled:opacity-50 min-h-[44px]"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {/* Master All-Themes Enable / Disable Controls & Per-Theme Quick Switches */}
      <div
        data-testid="click-anim-master-panel"
        className="rounded-2xl border border-border bg-surface-deep p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-foreground font-display flex items-center gap-1.5">
                <Power className="w-4 h-4 text-accent" />
                <span>All Themes Click Emoji Controls</span>
              </h4>
              <span
                data-testid="click-anim-summary-badge"
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider border ${
                  enabledSummary.allEnabled
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : enabledSummary.allDisabled
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                }`}
              >
                {enabledSummary.enabledCount} / {enabledSummary.total} Themes Enabled
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Turn click emoji animations ON or OFF for all 5 themes at once, or toggle any single theme immediately.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="click-anim-enable-all-btn"
              disabled={isSaving || enabledSummary.allEnabled}
              onClick={() => handleToggleAllThemes(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/45 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/30 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed min-h-[40px]"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Enable All</span>
            </button>
            <button
              type="button"
              data-testid="click-anim-disable-all-btn"
              disabled={isSaving || enabledSummary.allDisabled}
              onClick={() => handleToggleAllThemes(false)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/15 border border-rose-500/45 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-rose-300 hover:bg-rose-500/25 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed min-h-[40px]"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Disable All</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-2 border-t border-border/60">
          {STORE_THEME_LIST.map((th) => {
            const cfg = animations[th.id] || DEFAULT_CLICK_CONFIGS[th.id];
            const isEnabled = Boolean(cfg.enabled);
            return (
              <button
                key={th.id}
                type="button"
                data-testid={`quick-toggle-click-${th.id}`}
                aria-pressed={isEnabled}
                disabled={isSaving}
                onClick={() => handleQuickToggleTheme(th.id)}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 ${
                  isEnabled
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-foreground hover:bg-emerald-500/15'
                    : 'border-border bg-surface text-muted-foreground hover:border-border-strong'
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span>{cfg.emoji || th.emoji}</span>
                  <span className="truncate">{th.shortLabel}</span>
                </span>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase shrink-0 ${
                    isEnabled
                      ? 'bg-emerald-500/25 text-emerald-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {isEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Theme Selection Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {STORE_THEME_LIST.map((th) => {
          const isSelected = activeTabTheme === th.id;
          const isThemeEnabled = Boolean((animations[th.id] || DEFAULT_CLICK_CONFIGS[th.id]).enabled);
          return (
            <button
              key={th.id}
              type="button"
              onClick={() => setActiveTabTheme(th.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer min-h-[44px] ${
                isSelected
                  ? 'bg-accent text-accent-foreground shadow-md'
                  : 'bg-surface border border-border text-foreground hover:border-accent hover:text-accent'
              }`}
            >
              <span>{th.emoji}</span>
              <span>{th.shortLabel}</span>
              {!isThemeEnabled && (
                <span className="rounded px-1.5 py-0.5 text-[9px] font-black bg-rose-500/25 text-rose-200">
                  OFF
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Configuration Form for Selected Theme */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Settings Form */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-surface-deep p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h4 className="text-sm font-black uppercase tracking-wider text-foreground font-display flex items-center gap-2">
                <span>{activeThemeMeta.emoji}</span>
                <span>{activeThemeMeta.label} Click Animation</span>
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Each theme has its own independent click animation settings stored in the database.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                data-testid="click-anim-theme-enabled-toggle"
                checked={currentConfig.enabled}
                onChange={(e) => updateCurrentConfig({ enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent" />
              <span className="ml-2 text-xs font-bold text-foreground">
                {currentConfig.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>

          {/* Preset Selector Grid (15 Options) */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              Choose Animation Preset (15 Options)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {ANIMATION_PRESETS.map((preset) => {
                const isChosen = currentConfig.animationType === preset.id || currentConfig.emoji === preset.emoji;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id, preset.emoji)}
                    className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left text-xs font-bold transition-all cursor-pointer ${
                      isChosen
                        ? 'border-accent bg-accent/15 text-foreground shadow-sm'
                        : 'border-border bg-surface text-muted-foreground hover:text-foreground hover:border-border-strong'
                    }`}
                  >
                    <span className="text-base">{preset.emoji}</span>
                    <span className="truncate">{preset.label.replace(' Animation', '')}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Emoji Input */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              Or Add Custom Emoji / Characters
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customEmojiInput}
                onChange={(e) => setCustomEmojiInput(e.target.value)}
                placeholder="e.g. 🦄, ⚡, 🚀"
                maxLength={8}
                className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={handleApplyCustomEmoji}
                className="rounded-xl bg-accent/20 border border-accent/40 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-accent hover:bg-accent/30 cursor-pointer whitespace-nowrap min-h-[44px]"
              >
                Apply Custom
              </button>
            </div>
          </div>

          {/* Advanced Customization Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/60">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground block">
                Emojis Per Click: {currentConfig.count}
              </label>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={currentConfig.count}
                onChange={(e) => updateCurrentConfig({ count: Number(e.target.value) })}
                className="w-full accent-accent cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground block">
                Animation Duration: {currentConfig.duration}ms
              </label>
              <input
                type="range"
                min="300"
                max="1500"
                step="50"
                value={currentConfig.duration}
                onChange={(e) => updateCurrentConfig({ duration: Number(e.target.value) })}
                className="w-full accent-accent cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground block">Animation Size</label>
              <select
                value={currentConfig.size}
                onChange={(e) => updateCurrentConfig({ size: e.target.value as any })}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-foreground focus:border-accent focus:outline-none"
              >
                <option value="small">Small (Compact)</option>
                <option value="medium">Medium (Standard)</option>
                <option value="large">Large (Prominent)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground block">Animation Speed</label>
              <select
                value={currentConfig.speed}
                onChange={(e) => updateCurrentConfig({ speed: e.target.value as any })}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-foreground focus:border-accent focus:outline-none"
              >
                <option value="slow">Slow &amp; Gentle</option>
                <option value="normal">Normal</option>
                <option value="fast">Fast &amp; Energetic</option>
              </select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold text-muted-foreground block">Floating Direction</label>
              <select
                value={currentConfig.direction}
                onChange={(e) => updateCurrentConfig({ direction: e.target.value as any })}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-foreground focus:border-accent focus:outline-none"
              >
                <option value="burst">Radial Burst (All Directions)</option>
                <option value="up">Float Upwards</option>
                <option value="down">Drift Downwards</option>
              </select>
            </div>
          </div>

          {/* Toggle Switches for Rotation & Fade */}
          <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-border/60">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-foreground">
              <input
                type="checkbox"
                checked={currentConfig.rotation}
                onChange={(e) => updateCurrentConfig({ rotation: e.target.checked })}
                className="rounded border-border accent-accent h-4 w-4"
              />
              <span>Enable Rotation Effect</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-foreground">
              <input
                type="checkbox"
                checked={currentConfig.fade}
                onChange={(e) => updateCurrentConfig({ fade: e.target.checked })}
                className="rounded border-border accent-accent h-4 w-4"
              />
              <span>Enable Fade-out Effect</span>
            </label>
          </div>
        </div>

        {/* Right Col: Live Preview Box */}
        <div className="rounded-2xl border border-border bg-surface-deep p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-foreground font-display flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <span>Live Visual Preview</span>
            </h4>
            <p className="text-xs text-muted-foreground">
              Test how this click animation looks when triggered. Click the preview area below or press test button.
            </p>

            {/* Interactive Preview Canvas Box */}
            <div
              onClick={triggerLivePreview}
              className="relative aspect-square w-full rounded-xl border-2 border-dashed border-border bg-surface flex flex-col items-center justify-center p-6 text-center cursor-pointer hover:border-accent/70 transition-colors overflow-hidden group shadow-inner"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent pointer-events-none" />

              {previewBurst && (() => {
                const durSec = (currentConfig.duration || 700) / 1000;
                const mainSize = currentConfig.size === 'small' ? '22px' : currentConfig.size === 'large' ? '36px' : '28px';
                const rotVal = currentConfig.rotation ? '360deg' : '0deg';
                const midRotVal = currentConfig.rotation ? '180deg' : '0deg';
                const fadeVal = currentConfig.fade ? '0' : '0.9';
                const styleMeta = getClickVisualStyle(currentConfig, activeTabTheme);
                const isWinterSnowflake =
                  currentConfig.animationType === 'snowflake' || currentConfig.emoji === '❄️';
                const useSpinBlast =
                  isWinterSnowflake || (currentConfig.rotation && styleMeta.symmetricalSpin);

                return (
                  <div
                    key={previewBurst.key}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                  >
                    {/* Expanding themed halo or firework ring */}
                    <span
                      className="absolute left-1/2 top-1/2 rounded-full pointer-events-none"
                      style={{
                        width: styleMeta.showFireworkRing ? '96px' : '72px',
                        height: styleMeta.showFireworkRing ? '96px' : '72px',
                        border: styleMeta.showFireworkRing ? 'none' : `2px solid ${styleMeta.ringColor}`,
                        boxShadow: styleMeta.showFireworkRing
                          ? 'none'
                          : `0 0 20px ${styleMeta.ringColor}`,
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
                        } ${Math.min(0.7, durSec * 0.82)}s cubic-bezier(0.16, 1, 0.3, 1) both`,
                      }}
                    />

                    {/* Main center hero */}
                    <span
                      className="absolute left-1/2 top-1/2 select-none leading-none"
                      style={
                        {
                          '--glow-color': styleMeta.glowColor,
                          '--blast-mid-rot': midRotVal,
                          '--blast-rot': rotVal,
                          '--end-opacity': fadeVal,
                          fontSize: mainSize,
                          animation: useSpinBlast
                            ? `snowflakeBlast ${durSec}s cubic-bezier(0.16, 1, 0.3, 1) both`
                            : `clickHeroFloat ${durSec}s cubic-bezier(0.22, 1, 0.36, 1) both`,
                        } as React.CSSProperties
                      }
                    >
                      {currentConfig.emoji}
                    </span>

                    {/* Companion particles */}
                    {previewBurst.particles.map((p) => (
                      <span
                        key={p.id}
                        className="absolute left-1/2 top-1/2 select-none leading-none"
                        style={
                          {
                            '--dx': `${p.dx}px`,
                            '--dy': `${p.dy}px`,
                            '--mid-rot': `${p.midRotate}deg`,
                            '--rot': `${p.rotate}deg`,
                            '--end-opacity': fadeVal,
                            fontSize: `${p.sizePx}px`,
                            filter: `drop-shadow(0 0 8px ${styleMeta.glowColor})`,
                            animation: isWinterSnowflake
                              ? `particleFly ${durSec}s ease-out both`
                              : `clickParticleGlide ${durSec}s cubic-bezier(0.16, 1, 0.3, 1) both`,
                          } as React.CSSProperties
                        }
                      >
                        {p.emoji}
                      </span>
                    ))}
                  </div>
                );
              })()}

              <div
                className={`flex flex-col items-center transition-all duration-200 ${
                  previewBurst ? 'opacity-15 scale-90' : 'opacity-100 scale-100'
                }`}
              >
                <span className="text-3xl mb-2 group-hover:scale-125 transition-transform duration-300">
                  {currentConfig.emoji}
                </span>
                <span className="text-xs font-black text-foreground uppercase tracking-wider font-display">
                  {currentConfig.animationType.replace('_', ' ')}
                </span>
                <span className="text-[11px] text-muted-foreground mt-1">
                  {currentConfig.enabled ? 'Click box to test preview' : 'Animation currently disabled'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={triggerLivePreview}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent py-3 text-xs font-black uppercase tracking-wider text-accent-foreground hover:opacity-90 shadow-md cursor-pointer min-h-[44px]"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Test Animation Live</span>
          </button>
        </div>
      </div>

      {/* Floating Background Emojis Customizer */}
      <FloatingEmojiCustomizer
        onLogActivity={onLogActivity}
        adminName={adminName}
      />
    </div>
  );
};
