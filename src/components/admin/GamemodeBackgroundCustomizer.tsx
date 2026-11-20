import React, { useState, useEffect, useRef } from 'react';
import { useStoreConfig } from '../../context/StoreConfigContext';
import { useToast } from '../../context/ToastContext';
import { optimizeImage } from '../../utils/imageOptimizer';
import { sanitizeBannerUrl } from '../../utils/themeBannerHelpers';
import {
  LIFESTEAL_ICON_PRESETS,
  PRACTICE_ICON_PRESETS,
  normalizeGamemodeVisuals,
  sanitizeIconEmoji,
} from '../../utils/gamemodeVisualHelpers';
import type { GamemodeIconType, GamemodeVisualSettings } from '../../types';
import lifestealDefaultBg from '../../assets/images/lifesteal_bg_1794678969598.jpg';
import practiceDefaultBg from '../../assets/images/practice_bg_1794678987213.jpg';
import {
  Upload,
  Image as ImageIcon,
  RefreshCw,
  Save,
  Check,
  Sparkles,
  ArrowRight,
  Trash2,
  Layers,
  Heart,
  Swords,
  Loader2,
  Smile,
} from 'lucide-react';

interface GamemodeBackgroundCustomizerProps {
  onLogActivity?: (
    action: string,
    details: string,
    type?: 'product' | 'settings' | 'other',
    adminName?: string
  ) => void;
  adminName?: string;
  className?: string;
}

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

function readRawFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

export const GamemodeBackgroundCustomizer: React.FC<GamemodeBackgroundCustomizerProps> = ({
  onLogActivity,
  adminName,
  className = '',
}) => {
  const { config, updateConfig } = useStoreConfig();
  const { success, error } = useToast();

  // Draft state for Backgrounds
  const [lifestealDraft, setLifestealDraft] = useState(config.lifestealBgUrl || '');
  const [practiceDraft, setPracticeDraft] = useState(config.practiceBgUrl || '');

  // Draft state for Center Icons (Heart / Sword)
  const [lifestealIconType, setLifestealIconType] = useState<GamemodeIconType>(
    config.lifestealIconType || 'default'
  );
  const [lifestealIconValue, setLifestealIconValue] = useState(config.lifestealIconValue || '');
  const [practiceIconType, setPracticeIconType] = useState<GamemodeIconType>(
    config.practiceIconType || 'default'
  );
  const [practiceIconValue, setPracticeIconValue] = useState(config.practiceIconValue || '');

  const [isUploadingLifestealBg, setIsUploadingLifestealBg] = useState(false);
  const [isUploadingPracticeBg, setIsUploadingPracticeBg] = useState(false);
  const [isUploadingLifestealIcon, setIsUploadingLifestealIcon] = useState(false);
  const [isUploadingPracticeIcon, setIsUploadingPracticeIcon] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const lifestealFileInputRef = useRef<HTMLInputElement>(null);
  const practiceFileInputRef = useRef<HTMLInputElement>(null);
  const lifestealIconFileInputRef = useRef<HTMLInputElement>(null);
  const practiceIconFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLifestealDraft(config.lifestealBgUrl || '');
    setPracticeDraft(config.practiceBgUrl || '');
    setLifestealIconType(config.lifestealIconType || 'default');
    setLifestealIconValue(config.lifestealIconValue || '');
    setPracticeIconType(config.practiceIconType || 'default');
    setPracticeIconValue(config.practiceIconValue || '');
  }, [
    config.lifestealBgUrl,
    config.practiceBgUrl,
    config.lifestealIconType,
    config.lifestealIconValue,
    config.practiceIconType,
    config.practiceIconValue,
  ]);

  const isLifestealCustomBg = Boolean(lifestealDraft.trim());
  const isPracticeCustomBg = Boolean(practiceDraft.trim());
  const isLifestealCustomIcon = lifestealIconType !== 'default' && Boolean(lifestealIconValue.trim());
  const isPracticeCustomIcon = practiceIconType !== 'default' && Boolean(practiceIconValue.trim());

  const isDirty =
    lifestealDraft.trim() !== (config.lifestealBgUrl || '').trim() ||
    practiceDraft.trim() !== (config.practiceBgUrl || '').trim() ||
    lifestealIconType !== (config.lifestealIconType || 'default') ||
    lifestealIconValue.trim() !== (config.lifestealIconValue || '').trim() ||
    practiceIconType !== (config.practiceIconType || 'default') ||
    practiceIconValue.trim() !== (config.practiceIconValue || '').trim();

  const persistToBackendAndContext = async (
    nextVisuals: GamemodeVisualSettings,
    toastMsg: string,
    auditTitle: string,
    auditDetails: string
  ) => {
    setIsSaving(true);
    try {
      const normalized = normalizeGamemodeVisuals(nextVisuals);
      updateConfig(normalized);

      const res = await fetch('/api/admin/gamemode-visuals', {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify(normalized),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.visuals) {
          const serverVisuals = normalizeGamemodeVisuals(data.visuals);
          updateConfig(serverVisuals);
          window.dispatchEvent(
            new CustomEvent('wonder:gamemode-visuals-updated', {
              detail: { visuals: serverVisuals },
            })
          );
        }
      } else {
        window.dispatchEvent(
          new CustomEvent('wonder:gamemode-visuals-updated', {
            detail: { visuals: normalized },
          })
        );
      }

      onLogActivity?.(auditTitle, auditDetails, 'settings', adminName);
      success(toastMsg);
    } catch {
      success(toastMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadBg = async (mode: 'lifesteal' | 'practice', file: File) => {
    if (!file.type.startsWith('image/')) {
      error('Please select a valid image file (PNG, JPG, WEBP, GIF).');
      return;
    }

    if (mode === 'lifesteal') setIsUploadingLifestealBg(true);
    else setIsUploadingPracticeBg(true);

    try {
      const optimized = await optimizeImage(file, 1600, 900, 0.88);
      const sanitized = sanitizeBannerUrl(optimized);
      if (!sanitized) {
        error('The selected background image could not be processed.');
        return;
      }

      if (mode === 'lifesteal') {
        setLifestealDraft(sanitized);
        success('Lifesteal background ready! Click Save Changes to publish.');
      } else {
        setPracticeDraft(sanitized);
        success('Practice background ready! Click Save Changes to publish.');
      }
    } catch {
      error('Failed to upload background image. Please try again.');
    } finally {
      if (mode === 'lifesteal') setIsUploadingLifestealBg(false);
      else setIsUploadingPracticeBg(false);
    }
  };

  const handleUploadIcon = async (mode: 'lifesteal' | 'practice', file: File) => {
    if (!file.type.startsWith('image/')) {
      error('Please select a valid image file (PNG, JPG, WEBP, GIF).');
      return;
    }

    if (mode === 'lifesteal') setIsUploadingLifestealIcon(true);
    else setIsUploadingPracticeIcon(true);

    try {
      let dataUrl = '';
      if (file.type === 'image/gif' && file.size <= 900 * 1024) {
        dataUrl = await readRawFileAsDataUrl(file);
      } else {
        dataUrl = await optimizeImage(file, 512, 512, 0.92);
      }

      const sanitized = sanitizeBannerUrl(dataUrl);
      if (!sanitized) {
        error('The selected icon image could not be processed.');
        return;
      }

      if (mode === 'lifesteal') {
        setLifestealIconType('image');
        setLifestealIconValue(sanitized);
        success('Lifesteal custom icon uploaded! Click Save Changes to apply live.');
      } else {
        setPracticeIconType('image');
        setPracticeIconValue(sanitized);
        success('Practice custom icon uploaded! Click Save Changes to apply live.');
      }
    } catch {
      error('Failed to upload icon image. Please try again.');
    } finally {
      if (mode === 'lifesteal') setIsUploadingLifestealIcon(false);
      else setIsUploadingPracticeIcon(false);
    }
  };

  const buildCurrentVisualPayload = (overrides?: Partial<GamemodeVisualSettings>): GamemodeVisualSettings =>
    normalizeGamemodeVisuals({
      lifestealBgUrl: lifestealDraft,
      practiceBgUrl: practiceDraft,
      lifestealIconType,
      lifestealIconValue,
      practiceIconType,
      practiceIconValue,
      ...overrides,
    });

  const handleResetIcon = async (mode: 'lifesteal' | 'practice') => {
    if (mode === 'lifesteal') {
      setLifestealIconType('default');
      setLifestealIconValue('');
      await persistToBackendAndContext(
        buildCurrentVisualPayload({ lifestealIconType: 'default', lifestealIconValue: '' }),
        'Lifesteal card icon reset to default 3D Pixel Heart.',
        'Reset Lifesteal Card Icon',
        'Reset Lifesteal homepage icon to default 3D pixel heart'
      );
    } else {
      setPracticeIconType('default');
      setPracticeIconValue('');
      await persistToBackendAndContext(
        buildCurrentVisualPayload({ practiceIconType: 'default', practiceIconValue: '' }),
        'Practice card icon reset to default Diamond Sword.',
        'Reset Practice Card Icon',
        'Reset Practice homepage icon to default diamond sword'
      );
    }
  };

  const handleResetBg = async (mode: 'lifesteal' | 'practice') => {
    if (mode === 'lifesteal') {
      setLifestealDraft('');
      await persistToBackendAndContext(
        buildCurrentVisualPayload({ lifestealBgUrl: '' }),
        'Lifesteal background scenery reset to default.',
        'Reset Gamemode Background',
        'Reset Lifesteal card background to default scenery'
      );
    } else {
      setPracticeDraft('');
      await persistToBackendAndContext(
        buildCurrentVisualPayload({ practiceBgUrl: '' }),
        'Practice background scenery reset to default.',
        'Reset Gamemode Background',
        'Reset Practice card background to default scenery'
      );
    }
  };

  const handleResetAll = async () => {
    setLifestealDraft('');
    setPracticeDraft('');
    setLifestealIconType('default');
    setLifestealIconValue('');
    setPracticeIconType('default');
    setPracticeIconValue('');
    await persistToBackendAndContext(
      normalizeGamemodeVisuals({}),
      'Both Lifesteal & Practice cards reset to default icons and scenery.',
      'Reset Gamemode Card Visuals',
      'Reset Lifesteal & Practice card icons and background scenery to defaults'
    );
  };

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const payload = buildCurrentVisualPayload();

    if (lifestealIconType === 'image' && !payload.lifestealIconValue) {
      error('Please upload a Lifesteal icon image or paste a valid URL (or switch back to Default).');
      return;
    }
    if (lifestealIconType === 'emoji' && !payload.lifestealIconValue) {
      error('Please pick or type a Lifesteal emoji (or switch back to Default).');
      return;
    }
    if (practiceIconType === 'image' && !payload.practiceIconValue) {
      error('Please upload a Practice icon image or paste a valid URL (or switch back to Default).');
      return;
    }
    if (practiceIconType === 'emoji' && !payload.practiceIconValue) {
      error('Please pick or type a Practice emoji (or switch back to Default).');
      return;
    }

    await persistToBackendAndContext(
      payload,
      'Gamemode icons & background scenery saved! Changes are live on the homepage.',
      'Updated Gamemode Card Visuals',
      `Lifesteal (${payload.lifestealIconType}, ${payload.lifestealBgUrl ? 'Custom Bg' : 'Default Bg'}), Practice (${payload.practiceIconType}, ${payload.practiceBgUrl ? 'Custom Bg' : 'Default Bg'})`
    );
  };

  const activeLifestealBg = lifestealDraft.trim() || lifestealDefaultBg;
  const activePracticeBg = practiceDraft.trim() || practiceDefaultBg;

  const renderPreviewCenterIcon = (
    mode: 'lifesteal' | 'practice',
    type: GamemodeIconType,
    val: string
  ) => {
    const cleanVal = val.trim();
    if (type === 'image' && cleanVal) {
      return (
        <img
          src={cleanVal}
          alt={`${mode} custom icon preview`}
          className="w-12 h-12 object-contain drop-shadow-[0_0_14px_rgba(255,255,255,0.45)]"
        />
      );
    }
    if (type === 'emoji' && cleanVal) {
      return (
        <span className="text-3xl leading-none drop-shadow-[0_0_12px_rgba(255,255,255,0.45)]">
          {sanitizeIconEmoji(cleanVal) || cleanVal}
        </span>
      );
    }
    return (
      <span className="text-3xl leading-none drop-shadow-[0_0_12px_rgba(239,68,68,0.8)]">
        {mode === 'lifesteal' ? '❤️' : '⚔️'}
      </span>
    );
  };

  const renderIconControls = (mode: 'lifesteal' | 'practice') => {
    const isLs = mode === 'lifesteal';
    const currentType = isLs ? lifestealIconType : practiceIconType;
    const currentVal = isLs ? lifestealIconValue : practiceIconValue;
    const isUploading = isLs ? isUploadingLifestealIcon : isUploadingPracticeIcon;
    const fileRef = isLs ? lifestealIconFileInputRef : practiceIconFileInputRef;
    const presets = isLs ? LIFESTEAL_ICON_PRESETS : PRACTICE_ICON_PRESETS;
    const isCustom = isLs ? isLifestealCustomIcon : isPracticeCustomIcon;

    const setType = (nextType: GamemodeIconType) => {
      if (isLs) {
        setLifestealIconType(nextType);
        if (nextType === 'default') setLifestealIconValue('');
        else if (nextType === 'emoji' && !sanitizeIconEmoji(lifestealIconValue)) {
          setLifestealIconValue('❤️‍🔥');
        }
      } else {
        setPracticeIconType(nextType);
        if (nextType === 'default') setPracticeIconValue('');
        else if (nextType === 'emoji' && !sanitizeIconEmoji(practiceIconValue)) {
          setPracticeIconValue('🗡️');
        }
      }
    };

    const setVal = (val: string) => {
      if (isLs) setLifestealIconValue(val);
      else setPracticeIconValue(val);
    };

    const accentBorder = isLs ? 'border-purple-500/40' : 'border-sky-500/40';
    const accentBg = isLs ? 'bg-purple-500/15 hover:bg-purple-500/25 text-purple-200' : 'bg-sky-500/15 hover:bg-sky-500/25 text-sky-200';
    const activePill = isLs ? 'bg-purple-600 text-white shadow-sm' : 'bg-sky-600 text-white shadow-sm';

    return (
      <div className="rounded-xl border border-border bg-surface-deep/75 p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
            <Sparkles className={`w-3.5 h-3.5 ${isLs ? 'text-purple-400' : 'text-sky-400'}`} />
            <span>{isLs ? 'Heart Icon (Lifesteal Center)' : 'Sword Icon (Practice Center)'}</span>
          </label>
          {isCustom && (
            <button
              type="button"
              data-testid={`${mode}-reset-icon-btn`}
              onClick={() => handleResetIcon(mode)}
              className="text-[11px] font-bold text-muted-foreground hover:text-red-400 transition-colors cursor-pointer flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset Icon</span>
            </button>
          )}
        </div>

        {/* Mode Switcher Tabs: Default / Custom Image / Custom Emoji */}
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1">
          {(
            [
              { id: 'default', label: isLs ? 'Default Heart' : 'Default Sword' },
              { id: 'image', label: 'Own Image' },
              { id: 'emoji', label: 'Emoji / Icon' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              data-testid={`${mode}-icon-mode-${opt.id}`}
              onClick={() => setType(opt.id)}
              className={`rounded-lg py-1.5 px-2 text-[11px] font-black uppercase tracking-wide transition-colors cursor-pointer min-h-[34px] ${
                currentType === opt.id
                  ? activePill
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Mode 1: Custom Image Upload + URL */}
        {currentType === 'image' && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                ref={fileRef}
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadIcon(mode, file);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <button
                type="button"
                data-testid={`${mode}-upload-icon-btn`}
                onClick={() => fileRef.current?.click()}
                disabled={isUploading}
                className={`inline-flex items-center gap-2 rounded-xl border ${accentBorder} ${accentBg} px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer min-h-[38px]`}
              >
                {isUploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>{isUploading ? 'Uploading...' : 'Upload Own Icon (PNG/GIF/WEBP)'}</span>
              </button>
            </div>
            <div className="relative">
              <ImageIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                data-testid={`${mode}-icon-url-input`}
                value={currentVal}
                onChange={(e) => setVal(e.target.value)}
                placeholder="Or paste custom icon image URL (https://... or /assets/...)"
                className="w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-2 text-xs font-mono text-foreground outline-none focus:border-accent min-h-[38px]"
              />
            </div>
          </div>
        )}

        {/* Mode 2: Custom Emoji / Quick Picks */}
        {currentType === 'emoji' && (
          <div className="space-y-2.5">
            <div className="relative">
              <Smile className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                data-testid={`${mode}-icon-emoji-input`}
                value={currentVal}
                onChange={(e) => setVal(sanitizeIconEmoji(e.target.value) || e.target.value.slice(0, 4))}
                placeholder="Type any emoji (e.g. 💀, 🪓, 👑)..."
                className="w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-2 text-sm text-foreground outline-none focus:border-accent min-h-[38px]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => {
                const selected = currentVal.trim() === p.emoji;
                return (
                  <button
                    key={p.emoji}
                    type="button"
                    data-testid={`${mode}-emoji-preset-${p.label.toLowerCase().replace(/\s+/g, '-')}`}
                    onClick={() => setVal(p.emoji)}
                    title={p.label}
                    className={`h-9 w-9 rounded-xl border text-base flex items-center justify-center transition-all cursor-pointer ${
                      selected
                        ? isLs
                          ? 'border-purple-400 bg-purple-500/25 scale-105'
                          : 'border-sky-400 bg-sky-500/25 scale-105'
                        : 'border-border bg-surface hover:border-accent/60'
                    }`}
                  >
                    {p.emoji}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {currentType === 'default' && (
          <p className="text-[11px] text-muted-foreground">
            Using built-in animated 3D {isLs ? 'Pixel Heart ❤️' : 'Diamond Sword ⚔️'}. Switch to <strong>Own Image</strong> or <strong>Emoji / Icon</strong> above to replace it.
          </p>
        )}
      </div>
    );
  };

  return (
    <div
      data-testid="gamemode-visuals-customizer"
      className={`rounded-2xl border border-border bg-surface-deep p-4 sm:p-6 space-y-6 ${className}`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-foreground font-display">
                Lifesteal &amp; Practice Card Customizer (Icons &amp; Scenery)
              </h3>
              <span className="rounded-full bg-purple-500/20 border border-purple-500/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-purple-300">
                Live Homepage
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Customize both the center <strong>Heart &amp; Sword icons</strong> (upload your own PNG/GIF, paste a URL, or pick an emoji) and the <strong>background scenery</strong> of the homepage cards.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-end sm:self-center shrink-0">
          {(isLifestealCustomBg || isPracticeCustomBg || isLifestealCustomIcon || isPracticeCustomIcon) && (
            <button
              type="button"
              data-testid="reset-all-gamemode-visuals-btn"
              disabled={isSaving}
              onClick={handleResetAll}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer transition-colors min-h-[40px] whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              <span>Reset All Defaults</span>
            </button>
          )}

          <button
            type="button"
            data-testid="save-gamemode-visuals-top-btn"
            onClick={() => handleSave()}
            disabled={!isDirty || isSaving}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition-all min-h-[40px] shadow-sm whitespace-nowrap shrink-0 ${
              isDirty
                ? 'bg-accent text-accent-foreground hover:opacity-90 cursor-pointer ring-2 ring-accent/30'
                : 'bg-surface border border-border text-muted-foreground cursor-default opacity-60'
            }`}
          >
            <Save className="w-3.5 h-3.5 shrink-0" />
            <span>{isSaving ? 'Saving...' : isDirty ? 'Save Changes' : 'Saved'}</span>
          </button>
        </div>
      </div>

      {/* Two Column Grid for Lifesteal & Practice */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ========================================================= */}
        {/* 1. LIFESTEAL GAMEMODE CARD CUSTOMIZER                     */}
        {/* ========================================================= */}
        <div className="rounded-2xl border border-purple-500/30 bg-surface/60 p-4 sm:p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
                  <Heart className="w-4 h-4 fill-purple-400 text-purple-300" />
                </div>
                <h4 className="text-sm font-black uppercase tracking-wider text-purple-200 font-display">
                  1. Lifesteal Card Visuals
                </h4>
              </div>
              <span
                className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  isLifestealCustomBg || isLifestealCustomIcon
                    ? 'border-purple-400/50 bg-purple-500/20 text-purple-300'
                    : 'border-border bg-surface-deep text-muted-foreground'
                }`}
              >
                {isLifestealCustomIcon ? 'Custom Icon' : isLifestealCustomBg ? 'Custom Bg' : 'Default'}
              </span>
            </div>

            {/* Live Interactive Card Preview */}
            <div className="relative rounded-2xl overflow-hidden border-2 border-purple-500/60 h-44 sm:h-48 flex flex-col items-center justify-center text-center p-4 shadow-[0_0_25px_rgba(168,85,247,0.25)] group">
              <img
                src={activeLifestealBg}
                alt="Lifesteal card preview"
                className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = lifestealDefaultBg;
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0e021c]/90 via-[#100322]/70 to-[#190533]/40 pointer-events-none" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.3),transparent_70%)] pointer-events-none" />

              <div className="relative z-10 flex flex-col items-center gap-1.5">
                {renderPreviewCenterIcon('lifesteal', lifestealIconType, lifestealIconValue)}
                <span className="text-lg sm:text-xl font-black text-white uppercase tracking-[0.16em] font-sans drop-shadow-md">
                  LIFESTEAL
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-wide text-white bg-gradient-to-r from-purple-600 to-fuchsia-600 border border-purple-300/40 shadow-sm mt-0.5">
                  <span>Select Lifesteal</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>

              <div className="absolute bottom-2 left-2 z-10">
                <span className="text-[10px] bg-black/70 backdrop-blur-md text-white/90 px-2 py-0.5 rounded-md font-mono border border-white/10">
                  Live Preview
                </span>
              </div>
            </div>

            {/* Center Heart Icon Controls */}
            {renderIconControls('lifesteal')}

            {/* Background Scenery Controls */}
            <div className="rounded-xl border border-border bg-surface-deep/50 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-foreground">
                  Lifesteal Background Image
                </label>
                {isLifestealCustomBg && (
                  <button
                    type="button"
                    onClick={() => handleResetBg('lifesteal')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Reset Bg</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  ref={lifestealFileInputRef}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadBg('lifesteal', file);
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => lifestealFileInputRef.current?.click()}
                  disabled={isUploadingLifestealBg}
                  className="inline-flex items-center gap-2 rounded-xl border border-purple-500/40 bg-purple-500/15 hover:bg-purple-500/25 px-3.5 py-2 text-xs font-bold text-purple-300 transition-colors cursor-pointer min-h-[38px]"
                >
                  {isUploadingLifestealBg ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>{isUploadingLifestealBg ? 'Optimizing...' : 'Upload Background (PNG/JPG/WEBP)'}</span>
                </button>
              </div>

              <div className="relative">
                <ImageIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={lifestealDraft}
                  onChange={(e) => setLifestealDraft(e.target.value)}
                  placeholder="Or paste background URL (https://... or /assets/...)"
                  className="w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-2 text-xs font-mono text-foreground outline-none focus:border-purple-400 min-h-[38px]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 2. PRACTICE GAMEMODE CARD CUSTOMIZER                      */}
        {/* ========================================================= */}
        <div className="rounded-2xl border border-sky-500/30 bg-surface/60 p-4 sm:p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-300">
                  <Swords className="w-4 h-4 text-sky-300" />
                </div>
                <h4 className="text-sm font-black uppercase tracking-wider text-sky-200 font-display">
                  2. Practice Card Visuals
                </h4>
              </div>
              <span
                className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  isPracticeCustomBg || isPracticeCustomIcon
                    ? 'border-sky-400/50 bg-sky-500/20 text-sky-300'
                    : 'border-border bg-surface-deep text-muted-foreground'
                }`}
              >
                {isPracticeCustomIcon ? 'Custom Icon' : isPracticeCustomBg ? 'Custom Bg' : 'Default'}
              </span>
            </div>

            {/* Live Interactive Card Preview */}
            <div className="relative rounded-2xl overflow-hidden border-2 border-sky-500/60 h-44 sm:h-48 flex flex-col items-center justify-center text-center p-4 shadow-[0_0_25px_rgba(56,189,248,0.25)] group">
              <img
                src={activePracticeBg}
                alt="Practice card preview"
                className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = practiceDefaultBg;
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#020d24]/90 via-[#041538]/70 to-[#082255]/40 pointer-events-none" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.3),transparent_70%)] pointer-events-none" />

              <div className="relative z-10 flex flex-col items-center gap-1.5">
                {renderPreviewCenterIcon('practice', practiceIconType, practiceIconValue)}
                <span className="text-lg sm:text-xl font-black text-white uppercase tracking-[0.16em] font-sans drop-shadow-md">
                  PRACTICE
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-wide text-white bg-gradient-to-r from-sky-600 to-blue-600 border border-sky-300/40 shadow-sm mt-0.5">
                  <span>Select Practice</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>

              <div className="absolute bottom-2 left-2 z-10">
                <span className="text-[10px] bg-black/70 backdrop-blur-md text-white/90 px-2 py-0.5 rounded-md font-mono border border-white/10">
                  Live Preview
                </span>
              </div>
            </div>

            {/* Center Sword Icon Controls */}
            {renderIconControls('practice')}

            {/* Background Scenery Controls */}
            <div className="rounded-xl border border-border bg-surface-deep/50 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-foreground">
                  Practice Background Image
                </label>
                {isPracticeCustomBg && (
                  <button
                    type="button"
                    onClick={() => handleResetBg('practice')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Reset Bg</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  ref={practiceFileInputRef}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadBg('practice', file);
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => practiceFileInputRef.current?.click()}
                  disabled={isUploadingPracticeBg}
                  className="inline-flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 px-3.5 py-2 text-xs font-bold text-sky-300 transition-colors cursor-pointer min-h-[38px]"
                >
                  {isUploadingPracticeBg ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>{isUploadingPracticeBg ? 'Optimizing...' : 'Upload Background (PNG/JPG/WEBP)'}</span>
                </button>
              </div>

              <div className="relative">
                <ImageIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={practiceDraft}
                  onChange={(e) => setPracticeDraft(e.target.value)}
                  placeholder="Or paste background URL (https://... or /assets/...)"
                  className="w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-2 text-xs font-mono text-foreground outline-none focus:border-sky-400 min-h-[38px]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info & Save Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Custom Heart/Sword icons and background images save permanently to the server and update live for all players.
        </p>

        <button
          type="button"
          data-testid="save-gamemode-visuals-btn"
          onClick={() => handleSave()}
          disabled={!isDirty || isSaving}
          className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all min-h-[44px] shadow-sm ${
            isDirty
              ? 'bg-accent text-accent-foreground hover:opacity-90 cursor-pointer shadow-accent/25 ring-2 ring-accent/40'
              : 'bg-surface border border-border text-muted-foreground cursor-default opacity-60'
          }`}
        >
          <Check className="w-4 h-4" />
          <span>{isSaving ? 'Saving...' : isDirty ? 'Save Card Icons & Backgrounds' : 'Cards Up-to-Date'}</span>
        </button>
      </div>
    </div>
  );
};
