import React, { createContext, useContext, useState, useEffect } from 'react';
import { STORE_CONFIG } from '../config/storeDefaults';
import { GamemodeIconType, GamemodeVisualSettings, StoreThemeId, ThemeSettingItem } from '../types';
import { storageAdapter, STORAGE_KEYS } from '../services/storageAdapter';
import { DEFAULT_STORE_THEME, isValidStoreTheme } from '../utils/categoryTheme';
import {
  DEFAULT_THEME_SETTINGS,
  normalizeThemeSettings,
  resolveThemeBannerUrl,
} from '../utils/themeBannerHelpers';
import { normalizeGamemodeVisuals } from '../utils/gamemodeVisualHelpers';

export interface StoreConfigState {
  brand: string;
  brandUpper: string;
  storeName: string;
  tagline: string;
  description: string;
  serverIp: string;
  bedrockPort: string;
  serverName: string;
  website: string;
  discordUrl: string;
  upiId: string;
  upiPayeeName: string;
  customQrUrl: string;
  qrMode: 'dynamic' | 'custom';
  whatsappUrl: string;
  instagramUrl: string;
  youtubeUrl: string;
  telegramUrl: string;
  copyright: string;
  // Dynamic Tiles & Announcements
  serverTagline: string;
  showServerTagline: boolean;
  announcements: string[];
  showAnnouncements: boolean;
  announcementSpeed: 'normal' | 'slow' | 'fast';
  // Discord Bot & Webhook Settings
  discordWebhookUrl: string;
  discordWebhookEnabled: boolean;
  discordBotName: string;
  discordAvatarUrl: string;
  discordPingRole: string;
  discordNotifyOnPayment: boolean;
  discordNotifyOnTicket: boolean;
  storeTheme: StoreThemeId;
  lifestealBgUrl?: string;
  practiceBgUrl?: string;
  lifestealIconType?: GamemodeIconType;
  lifestealIconValue?: string;
  practiceIconType?: GamemodeIconType;
  practiceIconValue?: string;
}

export const DEFAULT_STORE_CONFIG: StoreConfigState = {
  brand: STORE_CONFIG.brand || 'WonderMC',
  brandUpper: STORE_CONFIG.brandUpper || 'WONDERMC',
  storeName: STORE_CONFIG.storeName || 'WonderMC Store',
  tagline: STORE_CONFIG.tagline || 'Best Indian Minecraft Network',
  serverTagline: STORE_CONFIG.serverTagline || 'PLAY FAIR, STAY RESPECTFUL. ENJOY THE SERVER',
  showServerTagline: STORE_CONFIG.showServerTagline ?? true,
  announcements: STORE_CONFIG.announcements || [
    '❄️ Happy Winter Season from WonderMC! • Use Code WINTER30 for 30% OFF • play.wondermc.fun',
    '🌨️ Winter Frost Season Live on WonderMC Lifesteal • play.wondermc.fun',
    '🎁 Festive Rewards! Winter Ranks & Frost Crate Keys Available Now • play.wondermc.fun',
    '🔥 WonderMC Minecraft Network • India\'s #1 Lifesteal Server • play.wondermc.fun',
  ],
  showAnnouncements: STORE_CONFIG.showAnnouncements ?? true,
  announcementSpeed: STORE_CONFIG.announcementSpeed || 'normal',
  description: STORE_CONFIG.description || 'Buy ranks, perks, coins and crate keys for the WonderMC Minecraft server.',
  serverIp: STORE_CONFIG.serverIp || 'play.wondermc.fun',
  bedrockPort: '19132',
  serverName: STORE_CONFIG.serverName || 'Lifesteal',
  website: STORE_CONFIG.website || 'play.wondermc.fun',
  discordUrl: STORE_CONFIG.discordUrl || 'https://discord.gg/ThS4XSJ9bC',
  upiId: STORE_CONFIG.upiId || 'farhanastro@fam',
  upiPayeeName: 'WonderMC Network',
  customQrUrl: '',
  qrMode: 'dynamic',
  whatsappUrl: 'https://wa.me/919931700000',
  instagramUrl: STORE_CONFIG.instagramUrl || 'https://www.instagram.com/wondermc',
  youtubeUrl: STORE_CONFIG.youtubeUrl || 'https://www.youtube.com/@wondermc',
  telegramUrl: 'https://t.me/wondermc',
  copyright: STORE_CONFIG.copyright || '© 2026 WonderMC Network. All Rights Reserved.',
  discordWebhookUrl: '',
  discordWebhookEnabled: true,
  discordBotName: 'WonderMC Store Bot',
  discordAvatarUrl: 'https://mc-heads.net/avatar/MHF_Chest/128',
  discordPingRole: '@here',
  discordNotifyOnPayment: true,
  discordNotifyOnTicket: true,
  storeTheme: DEFAULT_STORE_THEME,
  lifestealBgUrl: '',
  practiceBgUrl: '',
  lifestealIconType: 'default',
  lifestealIconValue: '',
  practiceIconType: 'default',
  practiceIconValue: '',
};

interface StoreConfigContextType {
  config: StoreConfigState;
  themeSettings: Record<StoreThemeId, ThemeSettingItem>;
  previewTheme: StoreThemeId | null;
  effectiveTheme: StoreThemeId;
  getThemeBannerUrl: (themeId?: StoreThemeId, fallbackUrl?: string) => string;
  setPreviewTheme: (theme: StoreThemeId | null) => void;
  activateTheme: (theme: StoreThemeId) => void;
  resetThemeToDefault: () => void;
  updateConfig: (partial: Partial<StoreConfigState>) => void;
  resetConfig: () => void;
}

const StoreConfigContext = createContext<StoreConfigContextType | undefined>(undefined);

export const StoreConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<StoreConfigState>(() => {
    const saved = storageAdapter.read<Partial<StoreConfigState> | null>(STORAGE_KEYS.STORE_CONFIG, null);
    if (saved && typeof saved === 'object') {
      const merged = { ...DEFAULT_STORE_CONFIG, ...saved };
      if (!isValidStoreTheme(merged.storeTheme)) {
        merged.storeTheme = DEFAULT_STORE_THEME;
      }
      return merged;
    }
    return DEFAULT_STORE_CONFIG;
  });

  const [themeSettings, setThemeSettings] = useState<Record<StoreThemeId, ThemeSettingItem>>(
    DEFAULT_THEME_SETTINGS
  );
  const [previewTheme, setPreviewTheme] = useState<StoreThemeId | null>(null);

  useEffect(() => {
    const syncThemeFromBackend = () => {
      fetch('/api/theme-settings')
        .then((res) => res.json())
        .then((data) => {
          if (data && data.settings) {
            const normalized = normalizeThemeSettings(data.settings);
            setThemeSettings(normalized);

            const now = new Date();
            // Check scheduled themes first
            const scheduledEntry = Object.entries(normalized).find(([_, setting]) => {
              if (!setting?.enabled) return false;
              if (setting?.startDate || setting?.endDate) {
                const start = setting.startDate
                  ? new Date(setting.startDate.length === 10 ? `${setting.startDate}T00:00:00` : setting.startDate)
                  : new Date(0);
                const end = setting.endDate
                  ? new Date(setting.endDate.length === 10 ? `${setting.endDate}T23:59:59.999` : setting.endDate)
                  : new Date(8640000000000000);
                return now >= start && now <= end;
              }
              return false;
            });

            if (scheduledEntry && isValidStoreTheme(scheduledEntry[0])) {
              const activeScheduled = scheduledEntry[0] as StoreThemeId;
              setConfig((prev) => {
                if (prev.storeTheme === activeScheduled) return prev;
                return { ...prev, storeTheme: activeScheduled };
              });
              return;
            }

            // Check default theme (and ensure currently selected theme isn't disabled)
            const defaultEntry = Object.entries(normalized).find(([_, setting]) => {
              return setting?.enabled && setting?.isDefault;
            });

            if (defaultEntry && isValidStoreTheme(defaultEntry[0])) {
              const activeDefault = defaultEntry[0] as StoreThemeId;
              setConfig((prev) => {
                if (prev.storeTheme === activeDefault) return prev;
                return { ...prev, storeTheme: activeDefault };
              });
            }
          }
        })
        .catch(() => {});
    };

    const syncGamemodeVisualsFromBackend = () => {
      fetch('/api/gamemode-visuals')
        .then((res) => res.json())
        .then((data) => {
          if (data && data.visuals) {
            const normalized = normalizeGamemodeVisuals(data.visuals);
            setConfig((prev) => ({
              ...prev,
              ...normalized,
            }));
          }
        })
        .catch(() => {});
    };

    const syncStoreConfigFromBackend = () => {
      fetch('/api/store/config')
        .then((res) => res.json())
        .then((data) => {
          if (!data || !data.config || typeof data.config !== 'object') return;
          const c = data.config;
          setConfig((prev) => ({
            ...prev,
            brand: c.brand ?? prev.brand,
            brandUpper: c.brand_upper ?? prev.brandUpper,
            storeName: c.store_name ?? prev.storeName,
            tagline: c.tagline ?? prev.tagline,
            description: c.description ?? prev.description,
            serverIp: c.server_ip ?? prev.serverIp,
            bedrockPort: c.bedrock_port ?? prev.bedrockPort,
            serverName: c.server_name ?? prev.serverName,
            website: c.website ?? prev.website,
            discordUrl: c.discord_url ?? prev.discordUrl,
            upiId: c.upi_id ?? prev.upiId,
            upiPayeeName: c.upi_payee_name ?? prev.upiPayeeName,
            customQrUrl: c.custom_qr_url ?? prev.customQrUrl,
            qrMode: c.qr_mode ?? prev.qrMode,
            whatsappUrl: c.whatsapp_url ?? prev.whatsappUrl,
            instagramUrl: c.instagram_url ?? prev.instagramUrl,
            youtubeUrl: c.youtube_url ?? prev.youtubeUrl,
            telegramUrl: c.telegram_url ?? prev.telegramUrl,
            copyright: c.copyright ?? prev.copyright,
            serverTagline: c.server_tagline ?? prev.serverTagline,
            showServerTagline: c.show_server_tagline ?? prev.showServerTagline,
            announcements: Array.isArray(c.announcements) ? c.announcements : prev.announcements,
            showAnnouncements: c.show_announcements ?? prev.showAnnouncements,
            announcementSpeed: c.announcement_speed ?? prev.announcementSpeed,
            storeTheme: c.store_theme ?? prev.storeTheme,
            lifestealBgUrl: c.lifesteal_bg_url ?? prev.lifestealBgUrl,
            practiceBgUrl: c.practice_bg_url ?? prev.practiceBgUrl,
          }));
        })
        .catch(() => undefined);
    };

    syncThemeFromBackend();
    syncGamemodeVisualsFromBackend();
    syncStoreConfigFromBackend();

    const handleThemeEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent?.detail?.themeSettings) {
        setThemeSettings(normalizeThemeSettings(customEvent.detail.themeSettings));
      }
      if (customEvent?.detail?.themeId && isValidStoreTheme(customEvent.detail.themeId)) {
        setConfig((prev) => ({ ...prev, storeTheme: customEvent.detail.themeId }));
      }
      if (!customEvent?.detail?.themeSettings && !customEvent?.detail?.themeId) {
        syncThemeFromBackend();
      }
    };

    const handleGamemodeVisualsEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ visuals?: Partial<GamemodeVisualSettings> }>;
      if (customEvent?.detail?.visuals) {
        const normalized = normalizeGamemodeVisuals(customEvent.detail.visuals);
        setConfig((prev) => ({
          ...prev,
          ...normalized,
        }));
      } else {
        syncGamemodeVisualsFromBackend();
      }
    };

    window.addEventListener('wonder:theme-updated', handleThemeEvent);
    window.addEventListener('wonder:theme-settings-updated', syncThemeFromBackend);
    window.addEventListener('wonder:gamemode-visuals-updated', handleGamemodeVisualsEvent);
    return () => {
      window.removeEventListener('wonder:theme-updated', handleThemeEvent);
      window.removeEventListener('wonder:theme-settings-updated', syncThemeFromBackend);
      window.removeEventListener('wonder:gamemode-visuals-updated', handleGamemodeVisualsEvent);
    };
  }, []);

  const effectiveTheme: StoreThemeId = isValidStoreTheme(previewTheme)
    ? previewTheme
    : isValidStoreTheme(config.storeTheme)
    ? config.storeTheme
    : DEFAULT_STORE_THEME;

  const getThemeBannerUrl = (themeId?: StoreThemeId, fallbackUrl = ''): string => {
    return resolveThemeBannerUrl(themeId || effectiveTheme, themeSettings, fallbackUrl);
  };

  const updateConfig = (partial: Partial<StoreConfigState>) => {
    const next = { ...config, ...partial };
    setConfig(next);
    storageAdapter.write(STORAGE_KEYS.STORE_CONFIG, next);
    // Persist shared config to Supabase via the backend. Never persist a raw
    // password — config contains no credentials. Errors are non-fatal here;
    // the admin panel shows explicit save confirmations through its own flow.
    try {
      const token =
        sessionStorage.getItem('wondermc_support_staff_token') || '';
      void fetch('/api/store/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(next),
      }).catch(() => undefined);
    } catch {
      // ignore (SSR / storage unavailable)
    }
  };

  const activateTheme = (theme: StoreThemeId) => {
    const safeTheme = isValidStoreTheme(theme) ? theme : DEFAULT_STORE_THEME;
    setPreviewTheme(null);
    updateConfig({ storeTheme: safeTheme });
  };

  const resetThemeToDefault = () => {
    setPreviewTheme(null);
    updateConfig({ storeTheme: DEFAULT_STORE_THEME });
  };

  const resetConfig = () => {
    setPreviewTheme(null);
    setConfig(DEFAULT_STORE_CONFIG);
    storageAdapter.write(STORAGE_KEYS.STORE_CONFIG, DEFAULT_STORE_CONFIG);
  };

  return (
    <StoreConfigContext.Provider
      value={{
        config,
        themeSettings,
        previewTheme,
        effectiveTheme,
        getThemeBannerUrl,
        setPreviewTheme,
        activateTheme,
        resetThemeToDefault,
        updateConfig,
        resetConfig,
      }}
    >
      {children}
    </StoreConfigContext.Provider>
  );
};

export const useStoreConfig = () => {
  const context = useContext(StoreConfigContext);
  if (!context) {
    throw new Error('useStoreConfig must be used within a StoreConfigProvider');
  }
  return context;
};
