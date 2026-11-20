import React, { useEffect, useState } from 'react';
import { StoreThemeId, ThemeSettingItem } from '../../types';
import { useStoreConfig } from '../../context/StoreConfigContext';
import { useToast } from '../../context/ToastContext';
import { STORE_THEME_LIST, getThemeMeta } from '../../utils/categoryTheme';
import {
  DEFAULT_THEME_SETTINGS,
  normalizeThemeSettings,
} from '../../utils/themeBannerHelpers';
import {
  DEFAULT_FLOATING_EMOJIS,
  FLOATING_EMOJI_PRESETS,
  FloatingEmojiDensity,
  FloatingEmojiSpeed,
  applyFloatingEmojisToThemeSettings,
  getFloatingEmojisSummary,
  parseFloatingEmojiList,
  resolveFloatingEmojiConfig,
} from '../../utils/floatingEmojiHelpers';
import {
  Sparkles,
  Power,
  Save,
  RotateCcw,
  Layers,
  Plus,
  X,
  Wind,
} from 'lucide-react';

interface FloatingEmojiCustomizerProps {
  onLogActivity?: (
    action: string,
    details: string,
    type?: 'settings' | 'other',
    adminName?: string
  ) => void;
  adminName?: string;
}

const QUICK_ADD_EMOJIS = [
  '❄️',
  '🔥',
  '💎',
  '🪙',
  '❤️',
  '⚔️',
  '⭐',
  '✨',
  '🌙',
  '🪔',
  '🎄',
  '🎁',
  '🎆',
  '🎉',
  '👑',
  '🌸',
  '⚡',
  '🪄',
];

function getAdminHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('wondermc_support_staff_token') ||
    sessionStorage.getItem('wondermc_admin_auth_token') ||
    '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-admin-key'] = token;
  }
  return headers;
}

export const FloatingEmojiCustomizer: React.FC<FloatingEmojiCustomizerProps> = ({
  onLogActivity,
  adminName,
}) => {
  const { themeSettings: contextThemeSettings, effectiveTheme } = useStoreConfig();
  const { success, error: toastError } = useToast();

  const [localSettings, setLocalSettings] = useState<Record<StoreThemeId, ThemeSettingItem>>(
    () => normalizeThemeSettings(contextThemeSettings || DEFAULT_THEME_SETTINGS)
  );
  const [selectedTheme, setSelectedTheme] = useState<StoreThemeId>(effectiveTheme || 'winter');
  const [emojiInput, setEmojiInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalSettings(normalizeThemeSettings(contextThemeSettings));
  }, [contextThemeSettings]);

  const currentConfig = resolveFloatingEmojiConfig(selectedTheme, localSettings);
  const summary = getFloatingEmojisSummary(localSettings);
  const selectedThemeMeta = getThemeMeta(selectedTheme);

  const persistFloatingUpdates = async (
    nextSettings: Record<StoreThemeId, ThemeSettingItem>,
    toastMsg: string,
    auditDetails: string
  ) => {
    setIsSaving(true);
    try {
      const payload: Partial<
        Record<
          StoreThemeId,
          Pick<
            ThemeSettingItem,
            'floatingEmojisEnabled' | 'floatingEmojis' | 'floatingEmojiDensity' | 'floatingEmojiSpeed'
          >
        >
      > = {};

      STORE_THEME_LIST.forEach((th) => {
        const item = nextSettings[th.id];
        payload[th.id] = {
          floatingEmojisEnabled:
            typeof item?.floatingEmojisEnabled === 'boolean' ? item.floatingEmojisEnabled : true,
          floatingEmojis:
            Array.isArray(item?.floatingEmojis) && item.floatingEmojis.length > 0
              ? item.floatingEmojis
              : [...DEFAULT_FLOATING_EMOJIS[th.id]],
          floatingEmojiDensity: item?.floatingEmojiDensity || 'normal',
          floatingEmojiSpeed: item?.floatingEmojiSpeed || 'normal',
        };
      });

      const res = await fetch('/api/admin/floating-emojis', {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save floating emoji settings.');

      const saved = normalizeThemeSettings(data.settings);
      setLocalSettings(saved);
      window.dispatchEvent(
        new CustomEvent('wonder:theme-updated', {
          detail: { themeSettings: saved },
        })
      );
      onLogActivity?.('Floating Emojis Updated', auditDetails, 'settings', adminName);
      success(toastMsg);
    } catch (err: any) {
      toastError(err?.message || 'Failed to save floating emoji settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAllFloating = async (enabled: boolean) => {
    const next = applyFloatingEmojisToThemeSettings(localSettings, 'all', {
      floatingEmojisEnabled: enabled,
    });
    setLocalSettings(next);
    await persistFloatingUpdates(
      next,
      enabled
        ? 'Floating background emojis enabled for ALL 5 themes!'
        : 'Floating background emojis turned OFF for ALL 5 themes!',
      enabled
        ? 'Enabled floating background emojis across all 5 storefront themes'
        : 'Disabled floating background emojis across all 5 storefront themes'
    );
  };

  const handleToggleSelectedThemeEnabled = (enabled: boolean) => {
    setLocalSettings((prev) =>
      applyFloatingEmojisToThemeSettings(prev, selectedTheme, {
        floatingEmojisEnabled: enabled,
      })
    );
  };

  const handleSelectPreset = (emojis: string[]) => {
    setLocalSettings((prev) =>
      applyFloatingEmojisToThemeSettings(prev, selectedTheme, {
        floatingEmojis: emojis,
        floatingEmojisEnabled: true,
      })
    );
  };

  const handleAddOrReplaceCustom = (mode: 'add' | 'replace') => {
    const parsed = parseFloatingEmojiList(emojiInput);
    if (parsed.length === 0) {
      toastError('Please type at least 1 emoji (e.g. 🔥 💎 ⚔️).');
      return;
    }

    const updatedEmojis =
      mode === 'replace'
        ? parsed
        : Array.from(new Set([...currentConfig.emojis, ...parsed])).slice(0, 12);

    setLocalSettings((prev) =>
      applyFloatingEmojisToThemeSettings(prev, selectedTheme, {
        floatingEmojis: updatedEmojis,
        floatingEmojisEnabled: true,
      })
    );
    setEmojiInput('');
    success(
      mode === 'replace'
        ? 'Floating emojis replaced! Click Save to publish.'
        : 'Added emoji(s) to floating list! Click Save to publish.'
    );
  };

  const handleQuickAddEmoji = (emoji: string) => {
    if (currentConfig.emojis.includes(emoji)) {
      if (currentConfig.emojis.length <= 1) {
        toastError('Keep at least 1 floating emoji in the list.');
        return;
      }
      const filtered = currentConfig.emojis.filter((e) => e !== emoji);
      setLocalSettings((prev) =>
        applyFloatingEmojisToThemeSettings(prev, selectedTheme, {
          floatingEmojis: filtered,
        })
      );
      return;
    }
    const nextList = [...currentConfig.emojis, emoji].slice(0, 12);
    setLocalSettings((prev) =>
      applyFloatingEmojisToThemeSettings(prev, selectedTheme, {
        floatingEmojis: nextList,
        floatingEmojisEnabled: true,
      })
    );
  };

  const handleRemoveEmoji = (emoji: string) => {
    if (currentConfig.emojis.length <= 1) {
      toastError('At least 1 floating emoji is required (or toggle OFF above to hide).');
      return;
    }
    const nextList = currentConfig.emojis.filter((e) => e !== emoji);
    setLocalSettings((prev) =>
      applyFloatingEmojisToThemeSettings(prev, selectedTheme, {
        floatingEmojis: nextList,
      })
    );
  };

  const handleDensityChange = (density: FloatingEmojiDensity) => {
    setLocalSettings((prev) =>
      applyFloatingEmojisToThemeSettings(prev, selectedTheme, {
        floatingEmojiDensity: density,
      })
    );
  };

  const handleSpeedChange = (speed: FloatingEmojiSpeed) => {
    setLocalSettings((prev) =>
      applyFloatingEmojisToThemeSettings(prev, selectedTheme, {
        floatingEmojiSpeed: speed,
      })
    );
  };

  const handleSave = async (target: StoreThemeId | 'all') => {
    const next =
      target === 'all'
        ? applyFloatingEmojisToThemeSettings(localSettings, 'all', {
            floatingEmojisEnabled: currentConfig.enabled,
            floatingEmojis: currentConfig.emojis,
            floatingEmojiDensity: currentConfig.density,
            floatingEmojiSpeed: currentConfig.speed,
          })
        : localSettings;

    setLocalSettings(next);

    await persistFloatingUpdates(
      next,
      target === 'all'
        ? `Applied floating emojis (${currentConfig.emojis.join(' ')}) to ALL 5 themes!`
        : `Saved floating emojis for ${selectedThemeMeta.emoji} ${selectedThemeMeta.shortLabel}!`,
      target === 'all'
        ? `Applied floating emojis ${currentConfig.emojis.join(' ')} across all 5 themes`
        : `Updated floating emojis for ${selectedThemeMeta.label}: ${currentConfig.emojis.join(' ')}`
    );
  };

  const handleResetThemeDefaults = async () => {
    const next = applyFloatingEmojisToThemeSettings(localSettings, selectedTheme, {
      floatingEmojisEnabled: true,
      floatingEmojis: [...DEFAULT_FLOATING_EMOJIS[selectedTheme]],
      floatingEmojiDensity: 'normal',
      floatingEmojiSpeed: 'normal',
    });
    setLocalSettings(next);
    await persistFloatingUpdates(
      next,
      `Reset ${selectedThemeMeta.shortLabel} floating emojis to default!`,
      `Reset floating emojis for ${selectedThemeMeta.label} to defaults`
    );
  };

  return (
    <div
      data-testid="floating-emoji-customizer"
      className="rounded-2xl border border-border bg-surface-deep p-4 sm:p-5 space-y-5"
    >
      {/* Header + Master Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
            <Wind className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-foreground font-display">
                Floating Background Emojis
              </h3>
              <span
                data-testid="floating-emojis-summary-badge"
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider border ${
                  summary.allEnabled
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : summary.allDisabled
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                }`}
              >
                {summary.enabledCount} / {summary.total} Themes Active
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Change the falling/floating emojis across the website background for any theme, adjust speed &amp; density, or toggle them ON/OFF.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="floating-emojis-enable-all-btn"
            disabled={isSaving || summary.allEnabled}
            onClick={() => handleToggleAllFloating(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/45 px-3 py-2 text-xs font-black uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/30 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed min-h-[40px]"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Enable All</span>
          </button>
          <button
            type="button"
            data-testid="floating-emojis-disable-all-btn"
            disabled={isSaving || summary.allDisabled}
            onClick={() => handleToggleAllFloating(false)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/15 border border-rose-500/45 px-3 py-2 text-xs font-black uppercase tracking-wider text-rose-300 hover:bg-rose-500/25 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed min-h-[40px]"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Disable All</span>
          </button>
        </div>
      </div>

      {/* Theme Selector Tabs */}
      <div className="flex flex-wrap gap-2">
        {STORE_THEME_LIST.map((th) => {
          const isTarget = selectedTheme === th.id;
          const thCfg = resolveFloatingEmojiConfig(th.id, localSettings);
          return (
            <button
              key={th.id}
              type="button"
              data-testid={`floating-theme-tab-${th.id}`}
              onClick={() => setSelectedTheme(th.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer min-h-[40px] ${
                isTarget
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'bg-surface border border-border text-foreground hover:border-accent hover:text-accent'
              }`}
            >
              <span>{thCfg.emojis[0] || th.emoji}</span>
              <span>{th.shortLabel}</span>
              {!thCfg.enabled && (
                <span className="rounded px-1.5 py-0.5 text-[9px] font-black bg-rose-500/25 text-rose-200">
                  OFF
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Editor + Live Preview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Controls (8 cols) */}
        <div className="lg:col-span-8 space-y-4 rounded-xl border border-border bg-surface/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div>
              <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-foreground font-display flex items-center gap-1.5">
                <span>{selectedThemeMeta.emoji}</span>
                <span>{selectedThemeMeta.label} Floating Emojis</span>
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Pick a preset pack, tap quick emojis, or type your own custom emojis below.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                data-testid="floating-emojis-theme-enabled-toggle"
                checked={currentConfig.enabled}
                onChange={(e) => handleToggleSelectedThemeEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent" />
              <span className="ml-2 text-xs font-bold text-foreground">
                {currentConfig.enabled ? 'Visible' : 'Hidden'}
              </span>
            </label>
          </div>

          {/* Active Emojis Chips */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
              Currently Active Floating Emojis ({currentConfig.emojis.length}/12)
            </label>
            <div className="flex flex-wrap gap-2">
              {currentConfig.emojis.map((em) => (
                <span
                  key={em}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/15 px-2.5 py-1.5 text-sm font-bold text-foreground"
                >
                  <span className="text-base leading-none">{em}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveEmoji(em)}
                    aria-label={`Remove ${em}`}
                    className="rounded-full p-0.5 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Preset Emoji Packs */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
              Quick Emoji Packs (One-Click Apply)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {FLOATING_EMOJI_PRESETS.map((preset) => {
                const isSame =
                  preset.emojis.length === currentConfig.emojis.length &&
                  preset.emojis.every((val, i) => currentConfig.emojis[i] === val);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`floating-preset-${preset.id}`}
                    onClick={() => handleSelectPreset(preset.emojis)}
                    className={`rounded-xl border p-2 text-left transition-all cursor-pointer ${
                      isSame
                        ? 'border-accent bg-accent/15 text-foreground shadow-sm'
                        : 'border-border bg-surface-deep text-muted-foreground hover:text-foreground hover:border-border-strong'
                    }`}
                  >
                    <div className="text-sm tracking-widest truncate">
                      {preset.emojis.slice(0, 4).join(' ')}
                    </div>
                    <div className="text-[10px] font-bold mt-1 truncate">{preset.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Add Tap Grid */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
              Tap Any Emoji to Add / Remove
            </label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ADD_EMOJIS.map((em) => {
                const isSelected = currentConfig.emojis.includes(em);
                return (
                  <button
                    key={em}
                    type="button"
                    onClick={() => handleQuickAddEmoji(em)}
                    aria-pressed={isSelected}
                    aria-label={`Toggle emoji ${em}`}
                    className={`h-9 w-9 rounded-xl border text-base flex items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? 'border-accent bg-accent/20 shadow-sm scale-105'
                        : 'border-border bg-surface-deep hover:border-accent/60'
                    }`}
                  >
                    {em}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Emoji Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="floating-custom-emoji-input"
              className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block"
            >
              Or Type Custom Emojis (e.g. 🦄 ⚡ 🚀 🍀)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="floating-custom-emoji-input"
                data-testid="floating-custom-emoji-input"
                type="text"
                value={emojiInput}
                onChange={(e) => setEmojiInput(e.target.value)}
                placeholder="Type or paste emojis here..."
                className="flex-1 rounded-xl border border-border bg-surface-deep px-3.5 py-2 text-sm text-foreground focus:border-accent focus:outline-none min-h-[42px]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="floating-emoji-add-btn"
                  onClick={() => handleAddOrReplaceCustom('add')}
                  className="inline-flex items-center gap-1 rounded-xl border border-accent/40 bg-accent/15 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-accent hover:bg-accent/25 cursor-pointer min-h-[42px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
                <button
                  type="button"
                  data-testid="floating-emoji-replace-btn"
                  onClick={() => handleAddOrReplaceCustom('replace')}
                  className="inline-flex items-center gap-1 rounded-xl border border-sky-500/40 bg-sky-500/15 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-sky-300 hover:bg-sky-500/25 cursor-pointer min-h-[42px]"
                >
                  <span>Replace All</span>
                </button>
              </div>
            </div>
          </div>

          {/* Density & Speed Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Floating Emoji Density
              </label>
              <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-surface-deep p-1">
                {(['low', 'normal', 'high'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDensityChange(d)}
                    className={`rounded-lg py-1.5 text-[11px] font-black uppercase cursor-pointer transition-colors ${
                      currentConfig.density === d
                        ? 'bg-accent text-accent-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Fall / Float Speed
              </label>
              <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-surface-deep p-1">
                {(['slow', 'normal', 'fast'] as const).map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => handleSpeedChange(sp)}
                    className={`rounded-lg py-1.5 text-[11px] font-black uppercase cursor-pointer transition-colors ${
                      currentConfig.speed === sp
                        ? 'bg-accent text-accent-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {sp}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live Animated Preview & Save Actions (4 cols) */}
        <div className="lg:col-span-4 flex flex-col justify-between space-y-4 rounded-xl border border-border bg-surface/60 p-4">
          <div className="space-y-2.5">
            <h4 className="text-xs font-black uppercase tracking-wider text-foreground font-display flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-accent" />
              <span>Live Floating Preview</span>
            </h4>
            <div className="relative h-56 w-full rounded-xl border border-border bg-gradient-to-b from-[#071528] via-[#040c18] to-[#02060e] overflow-hidden flex items-center justify-center">
              {currentConfig.enabled ? (
                <>
                  {Array.from({ length: 12 }).map((_, idx) => (
                    <span
                      key={`${selectedTheme}-preview-${idx}`}
                      className="card-snowflake select-none"
                      style={{
                        left: `${8 + (idx * 8) % 86}%`,
                        animationDelay: `${-(idx * 0.45)}s`,
                        animationDuration: `${(3.2 * currentConfig.durationMultiplier).toFixed(2)}s`,
                        fontSize: idx % 2 === 0 ? '1rem' : '0.85rem',
                      }}
                    >
                      {currentConfig.emojis[idx % currentConfig.emojis.length]}
                    </span>
                  ))}
                  <div className="relative z-10 text-center px-3 py-2 rounded-xl bg-black/50 backdrop-blur-sm border border-white/10">
                    <div className="text-xs font-black uppercase tracking-wider text-white">
                      {selectedThemeMeta.shortLabel} Theme
                    </div>
                    <div className="text-[11px] text-sky-300 mt-0.5 font-mono">
                      {currentConfig.emojis.join(' ')}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center px-4 text-xs text-muted-foreground">
                  Floating emojis are currently <strong>OFF</strong> for {selectedThemeMeta.shortLabel}.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              data-testid="save-floating-emojis-btn"
              disabled={isSaving}
              onClick={() => handleSave(selectedTheme)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent py-2.5 px-4 text-xs font-black uppercase tracking-wider text-accent-foreground hover:opacity-90 shadow-md cursor-pointer disabled:opacity-50 min-h-[42px]"
            >
              <Save className="w-4 h-4" />
              <span>Save for {selectedThemeMeta.shortLabel}</span>
            </button>

            <button
              type="button"
              data-testid="apply-floating-emojis-all-btn"
              disabled={isSaving}
              onClick={() => handleSave('all')}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/15 py-2.5 px-4 text-xs font-black uppercase tracking-wider text-amber-200 hover:bg-amber-500/25 cursor-pointer disabled:opacity-50 min-h-[42px]"
            >
              <Layers className="w-4 h-4" />
              <span>Apply to All 5 Themes</span>
            </button>

            <button
              type="button"
              data-testid="reset-floating-emojis-btn"
              disabled={isSaving}
              onClick={handleResetThemeDefaults}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-deep py-2 px-4 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50 min-h-[38px]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset {selectedThemeMeta.shortLabel} Default</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
