import React, { useEffect, useRef, useState } from 'react';
import { StoreThemeId, ThemeSettingItem } from '../../types';
import { useStoreConfig } from '../../context/StoreConfigContext';
import { useToast } from '../../context/ToastContext';
import {
  DEFAULT_STORE_THEME,
  STORE_THEME_LIST,
  getThemeCardEffectConfig,
  getThemeMeta,
} from '../../utils/categoryTheme';
import {
  DEFAULT_THEME_SETTINGS,
  normalizeThemeSettings,
  resolveThemeBannerUrl,
  applyBannerToThemeSettings,
  sanitizeBannerUrl,
} from '../../utils/themeBannerHelpers';
import {
  type ClickAnimationConfig,
  DEFAULT_CLICK_CONFIGS,
  normalizeClickAnimationsMap,
  setAllClickAnimationsEnabled,
  getClickAnimationsEnabledSummary,
} from '../../utils/clickAnimationHelpers';
import { optimizeImage } from '../../utils/imageOptimizer';
import { THEME_PREVIEW_IMAGES } from '../../constants/themePreviews';
import { FloatingEmojiCustomizer } from './FloatingEmojiCustomizer';
import winterBanner from '../../assets/images/winter_hero_banner_1794389896432.jpg';
import {
  Check,
  Eye,
  RotateCcw,
  Sparkles,
  Palette,
  X,
  Calendar,
  Power,
  Image as ImageIcon,
  Upload,
  Save,
  Layers,
  Wand2,
} from 'lucide-react';

interface ThemeManagementTabProps {
  onLogActivity?: (action: string, details: string, type?: 'settings' | 'other', adminName?: string) => void;
  adminName?: string;
}

const CARD_SNOWFLAKES = [
  { left: '12%', delay: '0s', duration: '3.2s', size: '0.85rem' },
  { left: '28%', delay: '0.7s', duration: '3.8s', size: '0.75rem' },
  { left: '46%', delay: '0.3s', duration: '2.9s', size: '0.95rem' },
  { left: '64%', delay: '1.1s', duration: '3.5s', size: '0.8rem' },
  { left: '80%', delay: '0.5s', duration: '3.1s', size: '0.9rem' },
  { left: '91%', delay: '1.4s', duration: '3.7s', size: '0.7rem' },
];

const CHRISTMAS_LIGHTS = [
  { left: '10%', top: '12%', delay: '0s', color: '#fef08a' },
  { left: '34%', top: '8%', delay: '0.45s', color: '#f87171' },
  { left: '62%', top: '10%', delay: '0.9s', color: '#4ade80' },
  { left: '86%', top: '14%', delay: '0.3s', color: '#fde047' },
];

const CHRISTMAS_GIFTS = [
  { left: '14%', bottom: '18%', delay: '0s' },
  { left: '78%', bottom: '20%', delay: '0.55s' },
];

const NY_SPARKLES = [
  { left: '14%', top: '16%', delay: '0s', color: '#fde047' },
  { left: '32%', top: '26%', delay: '0.35s', color: '#c084fc' },
  { left: '54%', top: '14%', delay: '0.7s', color: '#fbbf24' },
  { left: '76%', top: '24%', delay: '0.2s', color: '#d8b4fe' },
  { left: '88%', top: '42%', delay: '0.6s', color: '#fde047' },
];

const RAMADAN_DECORATIONS = [
  { left: '12%', top: '12%', emoji: '🌙', size: '1.2rem', delay: '0s' },
  { left: '35%', top: '8%', emoji: '🪔', size: '1.1rem', delay: '0.4s' },
  { left: '65%', top: '10%', emoji: '⭐', size: '0.9rem', delay: '0.8s' },
  { left: '85%', top: '15%', emoji: '✨', size: '1rem', delay: '1.2s' },
];

export const ThemeManagementTab: React.FC<ThemeManagementTabProps> = ({
  onLogActivity,
  adminName,
}) => {
  const {
    config,
    previewTheme,
    effectiveTheme,
    setPreviewTheme,
    activateTheme,
    resetThemeToDefault,
  } = useStoreConfig();
  const { success, error: toastError } = useToast();

  const savedTheme: StoreThemeId = config.storeTheme || DEFAULT_STORE_THEME;
  const [selectedThemeId, setSelectedThemeId] = useState<StoreThemeId>(previewTheme || savedTheme);
  const [themeSettings, setThemeSettings] = useState<Record<StoreThemeId, ThemeSettingItem>>(DEFAULT_THEME_SETTINGS);
  const [clickAnimations, setClickAnimations] = useState<Record<StoreThemeId, ClickAnimationConfig>>(DEFAULT_CLICK_CONFIGS);
  const [bannerTargetTheme, setBannerTargetTheme] = useState<StoreThemeId>(previewTheme || savedTheme);
  const [bannerUrlDraft, setBannerUrlDraft] = useState('');
  const [isSavingBanner, setIsSavingBanner] = useState(false);
  const [bannerPreviewBroken, setBannerPreviewBroken] = useState(false);
  const bannerSectionRef = useRef<HTMLDivElement | null>(null);
  const [isEditingSchedule, setIsEditingSchedule] = useState<StoreThemeId | null>(null);
  const [scheduleStartDate, setScheduleStartDate] = useState('');
  const [scheduleEndDate, setScheduleEndDate] = useState('');

  const [burstSeq, setBurstSeq] = useState<Record<StoreThemeId, number>>({
    default: 0,
    winter: 0,
    christmas: 0,
    newyear2027: 0,
    ramadan: 0,
  });
  const [activeClickBurst, setActiveClickBurst] = useState<StoreThemeId | null>(null);
  const burstTimerRef = useRef<number | null>(null);

  useEffect(() => {
    fetch('/api/theme-settings')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.settings) {
          const normalized = normalizeThemeSettings(data.settings);
          setThemeSettings(normalized);
          setBannerUrlDraft(normalized[bannerTargetTheme]?.bannerUrl || '');
        }
      })
      .catch(() => {});

    fetch('/api/click-animations')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.animations) {
          setClickAnimations(normalizeClickAnimationsMap(data.animations));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setBannerUrlDraft(themeSettings[bannerTargetTheme]?.bannerUrl || '');
    setBannerPreviewBroken(false);
  }, [bannerTargetTheme, themeSettings]);

  useEffect(() => {
    return () => {
      if (burstTimerRef.current !== null) {
        window.clearTimeout(burstTimerRef.current);
      }
    };
  }, []);

  const triggerClickEffect = (themeId: StoreThemeId) => {
    setSelectedThemeId(themeId);
    setBurstSeq((prev) => ({
      ...prev,
      [themeId]: (prev[themeId] || 0) + 1,
    }));
    setActiveClickBurst(themeId);
    if (burstTimerRef.current !== null) {
      window.clearTimeout(burstTimerRef.current);
    }
    burstTimerRef.current = window.setTimeout(() => {
      setActiveClickBurst((current) => (current === themeId ? null : current));
    }, 1550);
  };

  const previewMeta = previewTheme ? getThemeMeta(previewTheme) : null;
  const displayMeta = getThemeMeta(effectiveTheme);

  const handleCardSelect = (themeId: StoreThemeId) => {
    triggerClickEffect(themeId);
  };

  const handlePreview = (e: React.MouseEvent, themeId: StoreThemeId) => {
    e.stopPropagation();
    triggerClickEffect(themeId);
    if (previewTheme === themeId) {
      setPreviewTheme(null);
      success('Exited theme preview.');
      return;
    }
    setPreviewTheme(themeId);
    const meta = getThemeMeta(themeId);
    success(`Previewing ${meta.emoji} ${meta.label} across the website.`);
  };

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

  const handleActivate = async (e: React.MouseEvent | null, themeId: StoreThemeId) => {
    e?.stopPropagation();
    triggerClickEffect(themeId);
    activateTheme(themeId);

    const updated = { ...themeSettings };
    (Object.keys(updated) as StoreThemeId[]).forEach((id) => {
      updated[id] = {
        ...updated[id],
        isDefault: id === themeId,
        enabled: id === themeId ? true : updated[id]?.enabled,
      };
    });
    setThemeSettings(updated);

    try {
      await fetch('/api/admin/theme-settings', {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify(updated),
      });
      window.dispatchEvent(new CustomEvent('wonder:theme-updated', { detail: { themeId } }));
    } catch {
      // non-blocking
    }

    const meta = getThemeMeta(themeId);
    onLogActivity?.(
      'Theme Activated',
      `Activated ${meta.label} across entire website (persisted)`,
      'settings',
      adminName
    );
    success(`${meta.emoji} ${meta.label} is now active across the entire website!`);
  };

  const handleResetDefault = async () => {
    triggerClickEffect(DEFAULT_STORE_THEME);
    resetThemeToDefault();

    const updated = { ...themeSettings };
    (Object.keys(updated) as StoreThemeId[]).forEach((id) => {
      updated[id] = {
        ...updated[id],
        isDefault: id === DEFAULT_STORE_THEME,
      };
    });
    setThemeSettings(updated);

    try {
      await fetch('/api/admin/theme-settings', {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify(updated),
      });
      window.dispatchEvent(new CustomEvent('wonder:theme-updated', { detail: { themeId: DEFAULT_STORE_THEME } }));
    } catch {
      // non-blocking
    }

    onLogActivity?.(
      'Theme Reset to Default',
      `Reset active website theme to default (${STORE_THEME_LIST[0].label})`,
      'settings',
      adminName
    );
    success('Theme reset to default.');
  };

  const handleToggleThemeEnabled = async (themeId: StoreThemeId, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = themeSettings[themeId] || DEFAULT_THEME_SETTINGS[themeId];
    const updated = { ...themeSettings, [themeId]: { ...current, enabled: !current.enabled } };
    setThemeSettings(updated);

    try {
      await fetch('/api/admin/theme-settings', {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify(updated),
      });
      success(`Theme ${themeId} is now ${!current.enabled ? 'Enabled' : 'Disabled'}.`);
    } catch {
      toastError('Failed to save theme setting to database.');
    }
  };

  const handleSetDefaultTheme = async (themeId: StoreThemeId, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = { ...themeSettings };
    (Object.keys(updated) as StoreThemeId[]).forEach((id) => {
      updated[id] = {
        ...updated[id],
        isDefault: id === themeId,
        enabled: id === themeId ? true : updated[id]?.enabled,
      };
    });
    setThemeSettings(updated);
    activateTheme(themeId);

    try {
      await fetch('/api/admin/theme-settings', {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify(updated),
      });
      window.dispatchEvent(new CustomEvent('wonder:theme-updated', { detail: { themeId } }));
      const meta = getThemeMeta(themeId);
      onLogActivity?.('Default Theme Updated', `Set ${meta.label} as default website theme`, 'settings', adminName);
      success(`${meta.emoji} ${meta.label} set as the default theme!`);
    } catch {
      toastError('Failed to save default theme to database.');
    }
  };

  const handleOpenSchedule = (themeId: StoreThemeId, e: React.MouseEvent) => {
    e.stopPropagation();
    const setting = themeSettings[themeId] || DEFAULT_THEME_SETTINGS[themeId];
    setIsEditingSchedule(themeId);
    setScheduleStartDate(setting.startDate || '');
    setScheduleEndDate(setting.endDate || '');
  };

  const handleSaveSchedule = async (themeId: StoreThemeId) => {
    const current = themeSettings[themeId] || DEFAULT_THEME_SETTINGS[themeId];
    const updated = {
      ...themeSettings,
      [themeId]: {
        ...current,
        startDate: scheduleStartDate || undefined,
        endDate: scheduleEndDate || undefined,
      },
    };
    setThemeSettings(updated);
    setIsEditingSchedule(null);

    try {
      await fetch('/api/admin/theme-settings', {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify(updated),
      });
      window.dispatchEvent(
        new CustomEvent('wonder:theme-updated', { detail: { themeSettings: updated } })
      );
      success(`Saved activation schedule for ${themeId} theme.`);
    } catch {
      toastError('Failed to save theme schedule.');
    }
  };

  const persistThemeSettings = async (
    nextSettings: Record<StoreThemeId, ThemeSettingItem>,
    toastMsg: string,
    auditAction: string,
    auditDetails: string
  ) => {
    setIsSavingBanner(true);
    try {
      const res = await fetch('/api/admin/theme-settings', {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify(nextSettings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save theme banner.');
      const saved = normalizeThemeSettings(data.settings);
      setThemeSettings(saved);
      window.dispatchEvent(
        new CustomEvent('wonder:theme-updated', {
          detail: { themeSettings: saved },
        })
      );
      onLogActivity?.(auditAction, auditDetails, 'settings', adminName);
      success(toastMsg);
    } catch (err: any) {
      toastError(err?.message || 'Failed to save theme banner.');
    } finally {
      setIsSavingBanner(false);
    }
  };

  const handleSaveThemeBanner = async (target: StoreThemeId | 'all') => {
    const trimmed = bannerUrlDraft.trim();
    if (trimmed && !sanitizeBannerUrl(trimmed)) {
      toastError('Please enter a valid image URL (https://... or /...) or upload an image file.');
      return;
    }
    const nextSettings = applyBannerToThemeSettings(themeSettings, target, trimmed);
    const meta = target === 'all' ? null : getThemeMeta(target);
    await persistThemeSettings(
      nextSettings,
      target === 'all'
        ? 'WonderMC banner updated across ALL 5 themes!'
        : `WonderMC banner saved for ${meta?.emoji} ${meta?.shortLabel}!`,
      'Theme Banner Updated',
      target === 'all'
        ? 'Applied custom WonderMC hero banner across all 5 themes'
        : `Updated WonderMC hero banner for ${meta?.label}`
    );
  };

  const handleUploadBannerFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      toastError('Unsupported image format. Please upload PNG, JPG, WEBP, or GIF.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toastError('Banner image is too large (max 5 MB).');
      return;
    }

    try {
      let dataUrl = '';
      if (file.type.toLowerCase() === 'image/gif') {
        dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(typeof ev.target?.result === 'string' ? ev.target.result : '');
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });
      } else {
        dataUrl = await optimizeImage(file, 1400, 700, 0.88);
      }

      const clean = sanitizeBannerUrl(dataUrl);
      if (!clean) {
        toastError('Processed banner exceeds size limit. Please choose a smaller image.');
        return;
      }

      setBannerUrlDraft(clean);
      setBannerPreviewBroken(false);
      const nextSettings = applyBannerToThemeSettings(themeSettings, bannerTargetTheme, clean);
      const meta = getThemeMeta(bannerTargetTheme);
      await persistThemeSettings(
        nextSettings,
        `Uploaded & saved new WonderMC banner for ${meta.emoji} ${meta.shortLabel}!`,
        'Theme Banner Uploaded',
        `Uploaded custom WonderMC hero banner for ${meta.label}`
      );
    } catch {
      toastError('Failed to process uploaded banner image.');
    }
  };

  const handleResetThemeBanner = async (target: StoreThemeId | 'all') => {
    setBannerUrlDraft('');
    setBannerPreviewBroken(false);
    const nextSettings = applyBannerToThemeSettings(themeSettings, target, '');
    const meta = target === 'all' ? null : getThemeMeta(target);
    await persistThemeSettings(
      nextSettings,
      target === 'all'
        ? 'Reset WonderMC banner to default for ALL 5 themes.'
        : `Reset WonderMC banner to default for ${meta?.emoji} ${meta?.shortLabel}.`,
      'Theme Banner Reset',
      target === 'all'
        ? 'Reset WonderMC hero banner to default across all 5 themes'
        : `Reset WonderMC hero banner to default for ${meta?.label}`
    );
  };

  const handleJumpToBannerEditor = (themeId: StoreThemeId, e: React.MouseEvent) => {
    e.stopPropagation();
    setBannerTargetTheme(themeId);
    setSelectedThemeId(themeId);
    bannerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleToggleMasterClickAnimations = async (enabled: boolean) => {
    const next = setAllClickAnimationsEnabled(clickAnimations, enabled);
    setClickAnimations(next);
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
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update click animations.');
      setClickAnimations(normalizeClickAnimationsMap(data.animations));
      window.dispatchEvent(
        new CustomEvent('wonder:click-animations-updated', {
          detail: { animations: data.animations },
        })
      );
      onLogActivity?.(
        'Click Animations Updated',
        enabled ? 'Enabled click emoji animations globally' : 'Disabled click emoji animations globally',
        'settings',
        adminName
      );
      success(enabled ? 'Click emoji animations enabled for all themes!' : 'Click emoji animations disabled for all themes!');
    } catch (err: any) {
      toastError(err?.message || 'Failed to update click animations.');
    }
  };

  const clickAnimSummary = getClickAnimationsEnabledSummary(clickAnimations);

  return (
    <div className="space-y-6">
      {/* Header & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border bg-surface-deep p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent border border-accent/30">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-foreground font-display">
              Theme Management (5 Themes)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose and apply a seasonal storefront theme: Default, Winter, Christmas, New Year 2027, or Ramadan.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {previewTheme && (
            <button
              type="button"
              onClick={() => setPreviewTheme(null)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-500/15 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-amber-200 hover:bg-amber-500/25 cursor-pointer min-h-[44px]"
            >
              <X className="w-3.5 h-3.5" />
              <span>Stop Preview</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleResetDefault}
            disabled={savedTheme === DEFAULT_STORE_THEME && !previewTheme}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-black uppercase tracking-wider text-foreground hover:border-accent hover:text-accent transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed min-h-[44px]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Default Theme</span>
          </button>
        </div>
      </div>

      {/* Theme Click Emoji Animations Master Toggle Card */}
      <div
        data-testid="theme-tab-click-anim-card"
        className="rounded-2xl border border-border bg-surface-deep p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent border border-accent/30">
            <Wand2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-foreground font-display">
                Theme Click Emoji Animations
              </h4>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider border ${
                  clickAnimSummary.allEnabled
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : clickAnimSummary.allDisabled
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                }`}
              >
                {clickAnimSummary.enabledCount} / {clickAnimSummary.total} Enabled
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Instantly turn interactive emoji pop-up animations ON or OFF across all storefront themes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="theme-tab-enable-click-anim"
            disabled={clickAnimSummary.allEnabled}
            onClick={() => handleToggleMasterClickAnimations(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/45 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/35 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed min-h-[40px]"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Enable Click Emojis</span>
          </button>
          <button
            type="button"
            data-testid="theme-tab-disable-click-anim"
            disabled={clickAnimSummary.allDisabled}
            onClick={() => handleToggleMasterClickAnimations(false)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/15 border border-rose-500/45 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-rose-300 hover:bg-rose-500/25 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed min-h-[40px]"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Disable Click Emojis</span>
          </button>
        </div>
      </div>

      {/* WonderMC Hero Banner Customizer (Per-Theme or Apply to All Themes) */}
      <div
        ref={bannerSectionRef}
        data-testid="theme-banner-customizer"
        className="rounded-2xl border border-border bg-surface-deep p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent border border-accent/30">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-foreground font-display">
                WonderMC Server Banner Customizer
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Change the top WonderMC hero banner for any single theme or apply one banner across all 5 themes anytime.
              </p>
            </div>
          </div>

          <span
            data-testid="banner-status-badge"
            className={`self-start sm:self-auto rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider border ${
              themeSettings[bannerTargetTheme]?.bannerUrl
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-surface border-border text-muted-foreground'
            }`}
          >
            {themeSettings[bannerTargetTheme]?.bannerUrl
              ? `Custom Banner Active (${getThemeMeta(bannerTargetTheme).shortLabel})`
              : `Using Default Banner (${getThemeMeta(bannerTargetTheme).shortLabel})`}
          </span>
        </div>

        {/* Select Theme to Edit Banner */}
        <div className="flex flex-wrap gap-2">
          {STORE_THEME_LIST.map((th) => {
            const isTarget = bannerTargetTheme === th.id;
            const hasCustom = Boolean(themeSettings[th.id]?.bannerUrl);
            return (
              <button
                key={th.id}
                type="button"
                data-testid={`banner-theme-tab-${th.id}`}
                onClick={() => setBannerTargetTheme(th.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  isTarget
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'bg-surface border border-border text-foreground hover:border-accent hover:text-accent'
                }`}
              >
                <span>{th.emoji}</span>
                <span>{th.shortLabel}</span>
                {hasCustom && (
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isTarget ? 'bg-slate-950' : 'bg-emerald-400'
                    }`}
                    title="Custom banner configured"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Preview + Controls Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          {/* Left: Live Banner Preview */}
          <div className="lg:col-span-5 rounded-xl border border-border bg-surface p-3 flex flex-col items-center justify-center min-h-[155px] overflow-hidden">
            {(() => {
              const draftCandidate = sanitizeBannerUrl(bannerUrlDraft);
              const previewImageUrl =
                !bannerPreviewBroken && draftCandidate
                  ? draftCandidate
                  : resolveThemeBannerUrl(bannerTargetTheme, themeSettings, winterBanner);
              return (
                <>
                  <img
                    src={bannerPreviewBroken ? winterBanner : previewImageUrl}
                    alt={`WonderMC ${getThemeMeta(bannerTargetTheme).label} Banner Preview`}
                    data-testid="admin-banner-preview-img"
                    onError={() => setBannerPreviewBroken(true)}
                    className="max-h-[125px] w-auto object-contain rounded-lg shadow-md"
                  />
                  <span className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {bannerPreviewBroken
                      ? 'Invalid image URL — showing default fallback'
                      : draftCandidate
                      ? `Previewing Banner for ${getThemeMeta(bannerTargetTheme).label}`
                      : `Default WonderMC Banner (${getThemeMeta(bannerTargetTheme).shortLabel})`}
                  </span>
                </>
              );
            })()}
          </div>

          {/* Right: Upload / Paste URL / Apply Actions */}
          <div className="lg:col-span-7 space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="theme-banner-url-input"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block"
              >
                Banner Image URL or Uploaded Image ({getThemeMeta(bannerTargetTheme).label})
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="theme-banner-url-input"
                  data-testid="theme-banner-url-input"
                  type="text"
                  value={bannerUrlDraft}
                  onChange={(e) => {
                    setBannerUrlDraft(e.target.value);
                    setBannerPreviewBroken(false);
                  }}
                  placeholder="https://... or /uploads/... or upload from device"
                  className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs text-foreground focus:border-accent focus:outline-none"
                />
                <label className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-accent/15 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-accent hover:bg-accent/25 cursor-pointer whitespace-nowrap min-h-[42px]">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Image</span>
                  <input
                    type="file"
                    data-testid="theme-banner-file-input"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleUploadBannerFile}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Supports PNG, JPG, WEBP, GIF (max 5 MB). Saved banners sync directly to the central database and update live.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                data-testid="save-theme-banner-btn"
                disabled={isSavingBanner}
                onClick={() => handleSaveThemeBanner(bannerTargetTheme)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-xs font-black uppercase tracking-wider text-accent-foreground hover:opacity-90 shadow-sm cursor-pointer disabled:opacity-50 min-h-[42px]"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save for {getThemeMeta(bannerTargetTheme).shortLabel}</span>
              </button>

              <button
                type="button"
                data-testid="apply-banner-all-themes-btn"
                disabled={isSavingBanner}
                onClick={() => handleSaveThemeBanner('all')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3.5 py-2.5 text-xs font-black uppercase tracking-wider text-amber-200 hover:bg-amber-500/25 cursor-pointer disabled:opacity-50 min-h-[42px]"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Apply to All 5 Themes</span>
              </button>

              <button
                type="button"
                data-testid="reset-theme-banner-btn"
                disabled={isSavingBanner || (!bannerUrlDraft && !themeSettings[bannerTargetTheme]?.bannerUrl)}
                onClick={() => handleResetThemeBanner(bannerTargetTheme)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs font-black uppercase tracking-wider text-foreground hover:border-rose-500/50 hover:text-rose-300 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed min-h-[42px]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Default</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5 Selectable Animated Theme Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {STORE_THEME_LIST.map((theme) => {
          const isActive = savedTheme === theme.id;
          const isPreviewing = previewTheme === theme.id;
          const isSelected = selectedThemeId === theme.id;
          const isBursting = activeClickBurst === theme.id && (burstSeq[theme.id] || 0) > 0;
          const previewSrc = THEME_PREVIEW_IMAGES[theme.id];
          const effectConfig = getThemeCardEffectConfig(theme.id);
          const setting = themeSettings[theme.id] || DEFAULT_THEME_SETTINGS[theme.id];

          return (
            <article
              key={theme.id}
              data-testid={`theme-card-${theme.id}`}
              data-selected={isSelected ? 'true' : 'false'}
              data-active={isActive ? 'true' : 'false'}
              tabIndex={0}
              aria-label={`${theme.label}. Tap to select and view ${effectConfig.effectLabel}.`}
              onClick={() => handleCardSelect(theme.id)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handleCardSelect(theme.id);
                }
              }}
              className={`theme-card-base rounded-2xl border-2 overflow-hidden flex flex-col justify-between bg-surface-deep cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                isSelected
                  ? effectConfig.glowClassName
                  : isActive
                  ? 'border-accent/80 shadow-lg'
                  : 'border-border hover:border-border-strong'
              }`}
            >
              <div>
                {/* 16:9 Preview Image + Per-Theme Animated Overlay */}
                <div className="relative aspect-video w-full overflow-hidden bg-black/40 border-b border-border">
                  <img
                    src={previewSrc}
                    alt={`${theme.label} visual preview`}
                    className="h-full w-full object-cover transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

                  {/* Theme 1: Default Sparkles */}
                  {theme.id === 'default' && isBursting && (
                    <div
                      key={`default-burst-${burstSeq.default}`}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
                    >
                      <span className="theme-click-pill rounded-full border border-sky-300/70 bg-sky-950/85 px-3.5 py-1.5 text-xs font-black tracking-wider text-sky-200 shadow-lg backdrop-blur-sm">
                        ✨ WONDERMC ACTIVE
                      </span>
                    </div>
                  )}

                  {/* Theme 2: Winter Selected Snowfall + Click Ice Shimmer */}
                  {theme.id === 'winter' && isSelected && (
                    <div
                      data-testid="winter-card-snowfall"
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 overflow-hidden"
                    >
                      {CARD_SNOWFLAKES.map((flake, idx) => (
                        <span
                          key={idx}
                          className="card-snowflake"
                          style={{
                            left: flake.left,
                            animationDelay: flake.delay,
                            animationDuration: flake.duration,
                            fontSize: flake.size,
                          }}
                        >
                          ❄️
                        </span>
                      ))}
                    </div>
                  )}
                  {theme.id === 'winter' && isBursting && (
                    <div
                      key={`winter-burst-${burstSeq.winter}`}
                      data-testid="winter-click-ice-effect"
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
                    >
                      <div className="ice-shimmer-sweep" />
                      <span className="theme-click-pill rounded-full border border-sky-200/70 bg-sky-950/85 px-3.5 py-1.5 text-xs font-black tracking-wider text-sky-100 shadow-lg backdrop-blur-sm">
                        ❄️ ICE FROST SELECTED
                      </span>
                    </div>
                  )}

                  {/* Theme 3: Christmas Selected Twinkling Lights + Animated Gift Boxes */}
                  {theme.id === 'christmas' && isSelected && (
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                      <div data-testid="christmas-twinkle-lights">
                        {CHRISTMAS_LIGHTS.map((light, idx) => (
                          <span
                            key={idx}
                            className="card-twinkle-light text-sm"
                            style={{
                              left: light.left,
                              top: light.top,
                              animationDelay: light.delay,
                              filter: `drop-shadow(0 0 6px ${light.color})`,
                            }}
                          >
                            ✨
                          </span>
                        ))}
                      </div>
                      <div data-testid="christmas-gift-boxes">
                        {CHRISTMAS_GIFTS.map((gift, idx) => (
                          <span
                            key={idx}
                            className="card-gift-hop text-base"
                            style={{
                              left: gift.left,
                              bottom: gift.bottom,
                              animationDelay: gift.delay,
                            }}
                          >
                            🎁
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {theme.id === 'christmas' && isBursting && (
                    <div
                      key={`christmas-burst-${burstSeq.christmas}`}
                      data-testid="christmas-click-effect"
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    >
                      <span className="theme-click-pill rounded-full border border-amber-300/70 bg-gradient-to-r from-red-700/90 to-emerald-700/90 px-3.5 py-1.5 text-xs font-black tracking-wider text-white shadow-lg">
                        🎄 ✨ 🎁 HOLIDAY SPIRIT
                      </span>
                    </div>
                  )}

                  {/* Theme 4: New Year 2027 Gold/Purple Sparkles + Click Fireworks Burst */}
                  {theme.id === 'newyear2027' && isSelected && (
                    <div
                      data-testid="ny2027-sparkles"
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 overflow-hidden"
                    >
                      {NY_SPARKLES.map((sp, idx) => (
                        <span
                          key={idx}
                          className="ny-sparkle-dot text-sm"
                          style={{
                            left: sp.left,
                            top: sp.top,
                            animationDelay: sp.delay,
                            color: sp.color,
                            filter: `drop-shadow(0 0 7px ${sp.color})`,
                          }}
                        >
                          ✦
                        </span>
                      ))}
                    </div>
                  )}
                  {theme.id === 'newyear2027' && isBursting && (
                    <div
                      key={`ny-burst-${burstSeq.newyear2027}`}
                      data-testid="ny2027-click-celebration"
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden"
                    >
                      <span
                        data-testid="ny2027-firework-burst"
                        className="ny-click-firework-ring"
                      />
                      <span className="ny-2027-celebration rounded-2xl border border-amber-300/90 bg-gradient-to-r from-amber-400 via-yellow-300 to-purple-600 px-4 py-1.5 text-lg font-black tracking-widest text-slate-950 shadow-[0_0_28px_rgba(251,191,36,0.85)] font-display">
                        🎆 2027 🎆
                      </span>
                    </div>
                  )}

                  {/* Theme 5: Ramadan Crescent Moon, Glowing Lanterns & Golden Stars */}
                  {theme.id === 'ramadan' && isSelected && (
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                      {RAMADAN_DECORATIONS.map((dec, idx) => (
                        <span
                          key={idx}
                          className="absolute animate-[ramadan-star-twinkle_2s_ease-in-out_infinite_alternate]"
                          style={{
                            left: dec.left,
                            top: dec.top,
                            fontSize: dec.size,
                            animationDelay: dec.delay,
                            filter: 'drop-shadow(0 0 10px rgba(251,191,36,0.9))',
                          }}
                        >
                          {dec.emoji}
                        </span>
                      ))}
                    </div>
                  )}
                  {theme.id === 'ramadan' && isBursting && (
                    <div
                      key={`ramadan-burst-${burstSeq.ramadan}`}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
                    >
                      <span className="theme-click-pill rounded-full border border-amber-300/80 bg-emerald-950/90 px-4 py-1.5 text-xs font-black tracking-wider text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.8)] backdrop-blur-sm">
                        🌙 RAMADAN KAREEM 🪔
                      </span>
                    </div>
                  )}

                  {/* Bottom Title + Animated Primary Emoji */}
                  <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-bold text-white/85 block">
                        {theme.tagline}
                      </span>
                      <h4 className="text-base font-black text-white font-display flex items-center gap-1.5">
                        <span
                          data-testid={`theme-emoji-${theme.id}`}
                          className={effectConfig.iconAnimationClass}
                        >
                          {theme.emoji}
                        </span>
                        <span>{theme.label}</span>
                      </h4>
                    </div>
                  </div>

                  {/* Top Badges */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none">
                    {isSelected ? (
                      <span
                        data-testid={`theme-selected-badge-${theme.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/30 bg-black/75 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-sm"
                      >
                        <Sparkles className="w-3 h-3" style={{ color: effectConfig.accentHex }} />
                        Selected
                      </span>
                    ) : (
                      <span />
                    )}

                    <div className="flex items-center gap-1.5">
                      {isPreviewing && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-950 shadow-md">
                          <Eye className="w-3 h-3" />
                          Previewing
                        </span>
                      )}
                      {isActive && (
                        <span
                          data-testid={`theme-active-badge-${theme.id}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-950 shadow-md"
                        >
                          <Check className="w-3 h-3" />
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Details & Color Swatches */}
                <div className="p-4 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-accent">
                      {effectConfig.effectLabel}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => handleSetDefaultTheme(theme.id, e)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 cursor-pointer ${
                          setting.isDefault
                            ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                            : 'bg-surface border-border text-muted-foreground hover:text-foreground'
                        }`}
                        title="Set as Default Theme"
                      >
                        <Check className="w-2.5 h-2.5" />
                        <span>{setting.isDefault ? 'Default' : 'Set Default'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleToggleThemeEnabled(theme.id, e)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 cursor-pointer ${
                          setting.enabled
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                        }`}
                      >
                        <Power className="w-2.5 h-2.5" />
                        <span>{setting.enabled ? 'Enabled' : 'Disabled'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleOpenSchedule(theme.id, e)}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                        title="Schedule Activation"
                      >
                        <Calendar className="w-2.5 h-2.5" />
                        <span>Schedule</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleJumpToBannerEditor(theme.id, e)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 cursor-pointer ${
                          setting.bannerUrl
                            ? 'bg-sky-500/15 border-sky-400/40 text-sky-300'
                            : 'bg-surface border-border text-muted-foreground hover:text-foreground'
                        }`}
                        title="Change WonderMC Banner for this theme"
                      >
                        <ImageIcon className="w-2.5 h-2.5" />
                        <span>{setting.bannerUrl ? 'Custom Banner' : 'Banner'}</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {theme.description}
                  </p>

                  <div className="flex items-center justify-between border-y border-border/60 py-2.5">
                    <span className="text-[11px] font-bold text-muted-foreground">Color Palette</span>
                    <div className="flex items-center gap-2">
                      {theme.palette.map((hex) => (
                        <span
                          key={hex}
                          className="h-5 w-5 rounded-md border border-white/25 shadow-sm"
                          style={{ backgroundColor: hex }}
                          title={hex}
                        />
                      ))}
                    </div>
                  </div>

                  <ul className="space-y-1.5 text-xs text-foreground/90">
                    {theme.highlights.map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Schedule Modal Inline */}
                  {isEditingSchedule === theme.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-2"
                    >
                      <div className="text-xs font-bold text-amber-300 flex items-center justify-between">
                        <span>Schedule Theme</span>
                        <button
                          type="button"
                          onClick={() => setIsEditingSchedule(null)}
                          className="text-amber-300 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <label className="text-muted-foreground block">Start Date</label>
                          <input
                            type="date"
                            value={scheduleStartDate}
                            onChange={(e) => setScheduleStartDate(e.target.value)}
                            className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
                          />
                        </div>
                        <div>
                          <label className="text-muted-foreground block">End Date</label>
                          <input
                            type="date"
                            value={scheduleEndDate}
                            onChange={(e) => setScheduleEndDate(e.target.value)}
                            className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSaveSchedule(theme.id)}
                        className="w-full mt-2 rounded bg-amber-400 py-1 text-xs font-bold text-slate-950"
                      >
                        Save Schedule
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Preview & Activate Controls */}
              <div className="p-4 pt-0 flex flex-col sm:flex-row items-stretch gap-2.5">
                <button
                  type="button"
                  onClick={(e) => handlePreview(e, theme.id)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-black uppercase tracking-wider whitespace-nowrap transition-colors cursor-pointer min-h-[44px] ${
                    isPreviewing
                      ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                      : 'border-border bg-surface text-foreground hover:border-accent hover:text-accent'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 shrink-0" />
                  <span>{isPreviewing ? 'Stop Preview' : 'Preview'}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => handleActivate(e, theme.id)}
                  disabled={isActive && !previewTheme}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer min-h-[44px] ${
                    isActive
                      ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                      : 'bg-accent text-accent-foreground hover:opacity-90 shadow-sm'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>{isActive ? 'Activated' : 'Activate'}</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Live Mini Admin Preview Strip */}
      <div
        data-store-theme={effectiveTheme}
        className="rounded-2xl border border-border bg-surface-deep p-4 sm:p-5 space-y-4 overflow-hidden transition-colors duration-300"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-foreground font-display">
              Live Admin Storefront Preview — {displayMeta.emoji} {displayMeta.label}
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Shows how navigation, category tiles, product cards, and buttons transition across the site.
            </p>
          </div>
          {previewMeta && (
            <button
              type="button"
              onClick={(e) => handleActivate(e, previewMeta.id)}
              className="rounded-xl bg-accent px-3.5 py-2 text-xs font-black uppercase tracking-wider text-accent-foreground hover:opacity-90 cursor-pointer min-h-[44px]"
            >
              Activate {previewMeta.shortLabel} Now
            </button>
          )}
        </div>

        <div className="rounded-xl border border-border bg-background p-4 space-y-3 transition-colors duration-300">
          {/* Mini Nav Preview */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 transition-colors duration-300">
            <span className="text-xs font-black font-display text-foreground">
              {displayMeta.emoji} {config.brand}
            </span>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-accent px-2.5 py-1 text-[10px] font-black text-accent-foreground">
                Store
              </span>
              <span className="text-[11px] font-bold text-muted-foreground">Staff</span>
              <span className="text-[11px] font-bold text-muted-foreground">Updates</span>
            </div>
          </div>

          {/* Mini Category + Product Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className={`cat-tile cat-tile-1 cat-theme-${effectiveTheme} rounded-xl border p-3 text-center`}>
              <span className="text-lg block">{displayMeta.emoji}</span>
              <span className="text-xs font-black text-white block mt-1">Ranks</span>
              <span className="text-[10px] text-white/80 block">Category Tile</span>
            </div>
            <div className={`cat-tile cat-tile-2 cat-theme-${effectiveTheme} rounded-xl border p-3 text-center`}>
              <span className="text-lg block">🪙</span>
              <span className="text-xs font-black text-white block mt-1">Coins</span>
              <span className="text-[10px] text-white/80 block">Category Tile</span>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3 flex flex-col justify-between transition-colors duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-foreground">Titan Rank</span>
                <span className="text-xs font-black text-gold">₹200</span>
              </div>
              <button
                type="button"
                onClick={(e) => handleActivate(e, effectiveTheme)}
                className="mt-2 w-full rounded-lg bg-accent py-1.5 text-[10px] font-black uppercase text-accent-foreground cursor-pointer"
              >
                Sample CTA
              </button>
            </div>
          </div>
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
