import React, { useState, useEffect, useRef } from 'react';
import { useCart, MinecraftEdition, formatIgnForEdition } from '../context/CartContext';
import { useSale } from '../context/SaleContext';
import { useStoreConfig } from '../context/StoreConfigContext';
import { useToast } from '../context/ToastContext';
import { RECENT_PURCHASES_TICKER } from '../config/storeDefaults';
import { EditionSelector } from './EditionSelector';
import { getThemeMeta } from '../utils/categoryTheme';
import {
  Copy,
  Check,
  ShoppingBag,
  Shield,
  HeartHandshake,
  Vote as VoteIcon,
  Layers,
  Radio,
  Compass,
  BookOpen,
  Wallet,
  Crown,
  LogOut,
} from 'lucide-react';

import winterBanner from '../assets/images/winter_hero_banner_1794389896432.jpg';

interface HeaderProps {
  currentView?: 'store' | 'donator' | 'staff' | 'updates' | 'join' | 'rules';
  onSelectView?: (view: 'store' | 'donator' | 'staff' | 'updates' | 'join' | 'rules') => void;
  onOpenVote: () => void;
  onOpenStaff: () => void;
  onOpenSupport: () => void;
  onOpenAccount: () => void;
  onOpenWallet?: () => void;
  onOpenLogin: () => void;
  selectedGamemode?: string;
  onSelectGamemode?: (mode: string) => void;
}

import { useAuth } from '../context/AuthContext';
import { useTickets } from '../context/TicketContext';
import { useWallet } from '../context/WalletContext';
import { User, LogIn } from 'lucide-react';

export const Header: React.FC<HeaderProps> = ({
  currentView = 'store',
  onSelectView,
  onOpenVote,
  onOpenStaff,
  onOpenSupport,
  onOpenAccount,
  onOpenWallet,
  onOpenLogin,
}) => {
  const { totalCount, username, setUsername, setIsCartOpen, edition, setEdition } = useCart();
  const { saleConfig } = useSale();
  const { config, effectiveTheme, getThemeBannerUrl } = useStoreConfig();
  const resolvedHeroBanner = getThemeBannerUrl(effectiveTheme, winterBanner);
  const [bannerFallbackActive, setBannerFallbackActive] = useState(false);

  useEffect(() => {
    setBannerFallbackActive(false);
  }, [resolvedHeroBanner]);
  const { success, error } = useToast();
  const { user, logout } = useAuth();
  const { unreadUserNotificationsCount, userTickets } = useTickets();
  const { wallet } = useWallet();
  const supportUnreadTotal =
    unreadUserNotificationsCount + userTickets.reduce((acc, t) => acc + (t.unreadByUser || 0), 0);

  const [copied, setCopied] = useState(false);
  const [cartBouncing, setCartBouncing] = useState(false);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [inputUsername, setInputUsername] = useState(username);
  const [tempEdition, setTempEdition] = useState<MinecraftEdition>(edition);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const guideDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (guideDropdownRef.current && !guideDropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  // Server status ping state
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [playersOnline, setPlayersOnline] = useState<number>(18);

  const handleSwitchPage = (page: 'store' | 'donator' | 'staff' | 'updates' | 'join' | 'rules') => {
    if (onSelectView) {
      onSelectView(page);
    } else if (page === 'staff') {
      onOpenStaff();
    }
  };

  useEffect(() => {
    // Listen for cart-add event to trigger animation
    const onCartAdd = () => {
      setCartBouncing(false);
      requestAnimationFrame(() => {
        setCartBouncing(true);
        setTimeout(() => setCartBouncing(false), 450);
      });
    };

    window.addEventListener('wondermc:cart-add', onCartAdd);
    window.addEventListener('minetax:cart-add', onCartAdd);
    return () => {
      window.removeEventListener('wondermc:cart-add', onCartAdd);
      window.removeEventListener('minetax:cart-add', onCartAdd);
    };
  }, []);

  // Ping Minecraft server status
  useEffect(() => {
    let isMounted = true;
    const checkServer = async () => {
      try {
        const res = await fetch(`https://api.mcsrvstat.us/3/${config.serverIp}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setServerOnline(Boolean(data.online));
            if (data.players && typeof data.players.online === 'number') {
              setPlayersOnline(data.players.online);
            }
          }
        } else {
          if (isMounted) setServerOnline(true);
        }
      } catch {
        if (isMounted) setServerOnline(true);
      }
    };

    checkServer();
    const interval = setInterval(checkServer, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [config.serverIp]);

  const handleCopyIp = async () => {
    try {
      await navigator.clipboard.writeText(config.serverIp);
      setCopied(true);
      success(`Copied ${config.serverIp} to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      error(`Server IP: ${config.serverIp}`);
    }
  };

  const handleOpenEditUsername = () => {
    setInputUsername(username);
    setTempEdition(edition);
    setIsEditingUsername(true);
  };

  const handleToggleTempEdition = (newEd: MinecraftEdition) => {
    setTempEdition(newEd);
    if (newEd === 'bedrock') {
      setInputUsername((prev) => {
        const trimmed = prev.trim();
        if (!trimmed) return '.';
        return trimmed.startsWith('.') ? trimmed : `.${trimmed.replace(/^\.+/, '')}`;
      });
    } else {
      setInputUsername((prev) => prev.replace(/^\.+/, ''));
    }
  };

  const handleSaveUsername = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputUsername.trim();
    if (!clean || clean === '.') {
      setUsername('');
      setIsEditingUsername(false);
      return;
    }
    const formatted = formatIgnForEdition(clean, tempEdition);
    setEdition(tempEdition);
    setUsername(formatted);
    setIsEditingUsername(false);
    success(`Signed in as ${formatted} (${tempEdition === 'bedrock' ? 'Bedrock' : 'Java'})`);
  };

  return (
    <header className="relative z-30">
      {/* Top Sale Bar */}
      {saleConfig.enabled && (
        <div className="flex flex-wrap items-center justify-center gap-3 border-b border-border bg-surface-deep/75 backdrop-blur-md px-5 py-2.5 text-[13px] font-semibold">
          <span className="rounded-full bg-accent px-3 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-accent-foreground shadow-sm">
            {saleConfig.pill}
          </span>
          <span className="text-foreground/90">
            <strong className="text-gold font-black">{saleConfig.highlight}</strong>
            {' — '}
            {saleConfig.text}
          </span>
        </div>
      )}

      {/* Hero Banner with Theme-Configurable WonderMC Logo & Taglines */}
      <div 
        className="relative flex flex-col items-center justify-center bg-transparent pt-6 pb-2"
      >
        <div className="relative z-10 w-full max-w-[1020px] px-4 text-center">
          <div
            className="inline-block cursor-pointer group"
            onClick={() => handleSwitchPage('store')}
            title="Click to go to Store Home"
          >
            {/* Dynamic WONDER MC Theme Banner */}
            <img
              src={bannerFallbackActive ? winterBanner : resolvedHeroBanner}
              alt={`WONDER MC ${getThemeMeta(effectiveTheme).label} Banner`}
              width={1280}
              height={543}
              data-testid="wondermc-hero-banner"
              onError={() => setBannerFallbackActive(true)}
              className="wondermc-banner max-h-[280px] sm:max-h-[340px] w-auto mx-auto object-contain transition-transform duration-300 group-hover:scale-[1.01] rounded-2xl shadow-xl shadow-sky-950/40"
            />

            {/* Page Context Badge (Shown on sub-pages) */}
            {currentView !== 'store' && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <span className="rounded-full bg-surface-deep/90 border border-border-strong px-3.5 py-1 font-mono text-xs font-bold text-accent uppercase tracking-wider shadow-sm">
                  {currentView === 'donator'
                    ? '👑 Server Donator Hub'
                    : currentView === 'staff'
                    ? `${getThemeMeta(effectiveTheme).emoji} Staff Team`
                    : currentView === 'updates'
                    ? '📢 Server Updates'
                    : currentView === 'join'
                    ? '🧭 Connection Guide'
                    : '📜 Server Rules'}
                </span>
              </div>
            )}

            {/* Server Tagline (Dynamic & Admin Configurable) */}
            {(config.showServerTagline !== false) && (config.serverTagline || '').trim() && (
              <p className="winter-tagline text-xs sm:text-sm md:text-base font-extrabold tracking-wider sm:tracking-widest uppercase mt-4 mb-3 drop-shadow-md leading-relaxed px-4 text-center">
                {config.serverTagline || 'PLAY FAIR, STAY RESPECTFUL. ENJOY THE SERVER'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Floating Interactive Navigation Bar (Expanded Card Layout) */}
      <nav className="relative z-30 mx-3 xl:mx-auto mt-1 sm:mt-2 max-w-[1240px] rounded-2xl border border-border bg-surface p-3.5 sm:p-5 shadow-panel">
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3.5">
          {/* Left Column: Copy Server IP & Top Page Selector */}
          <div className="flex flex-wrap xl:flex-nowrap items-center gap-3 shrink-0">
            <div className="flex flex-col items-stretch sm:items-start gap-1.5 shrink-0 w-full sm:w-auto">
              {/* Copy Server IP & Live Player Status */}
              <button
                type="button"
                onClick={handleCopyIp}
                title={`Click to copy ${config.serverIp}`}
                className={`group relative flex flex-wrap items-center justify-between sm:justify-start gap-2 rounded-xl border border-border bg-surface-deep px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-foreground transition-all duration-200 hover:border-border-strong active:scale-95 ${
                  copied ? 'border-success text-success' : ''
                }`}
              >
                <span>{config.serverIp}</span>
                <span className="text-[11px] text-muted-foreground group-hover:text-foreground flex items-center gap-1 font-mono">
                  {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'copied' : 'copy'}
                </span>

                {/* Online Status Pill */}
                <span className="flex items-center gap-1.5 text-[11px] font-extrabold normal-case ml-1 border-l border-border pl-2 text-muted-foreground">
                  <span className="relative flex h-2 w-2">
                    {serverOnline !== false && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                    )}
                    <span
                      className={`relative inline-flex h-2 w-2 rounded-full ${
                        serverOnline === false ? 'bg-destructive' : 'bg-success'
                      }`}
                    />
                  </span>
                  <span>
                    {serverOnline === null
                      ? 'Checking…'
                      : serverOnline
                      ? `${playersOnline} Players Online`
                      : 'Offline'}
                  </span>
                </span>
              </button>

              {/* Dropdown Menu under PLAY.WONDERMC.FUN COPY */}
              <div ref={guideDropdownRef} className="relative w-full">
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen((prev) => !prev)}
                  aria-expanded={isDropdownOpen}
                  aria-haspopup="menu"
                  className="flex items-center justify-between gap-1.5 w-full rounded-lg border border-border bg-surface-deep px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:border-border-strong transition-all cursor-pointer select-none"
                >
                  <span className="flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-sky-400" />
                    Server Connection &amp; Rules Guide
                  </span>
                  <span className="text-[9px] text-muted-foreground font-mono">▼</span>
                </button>

                {isDropdownOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 mt-1 z-40 w-56 rounded-xl border border-border bg-surface-deep p-1.5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        handleSwitchPage('join');
                        setIsDropdownOpen(false);
                      }}
                      className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs font-black uppercase text-left text-sky-300 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <Compass className="w-4 h-4 text-sky-400" />
                      <span>Open Connection Guide</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleSwitchPage('rules');
                        setIsDropdownOpen(false);
                      }}
                      className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs font-black uppercase text-left text-rose-300 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <BookOpen className="w-4 h-4 text-rose-400" />
                      <span>Open Server Rules</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Top Page Selector Tabs & Switcher */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap xl:flex-nowrap items-center gap-1.5 rounded-xl border border-border/80 bg-surface-deep p-1.5 w-full sm:w-auto">
              <span className="hidden 2xl:inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground pl-2 pr-1 select-none shrink-0">
                <Layers className="w-3 h-3 text-accent" />
                Page:
              </span>

              {/* Store Tab Button */}
              <button
                type="button"
                onClick={() => handleSwitchPage('store')}
                aria-current={currentView === 'store' ? 'page' : undefined}
                className={`flex items-center justify-center sm:justify-start gap-1.5 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wide whitespace-nowrap transition-[transform,box-shadow] duration-150 cursor-pointer ${
                  currentView === 'store'
                    ? 'bg-gradient-to-r from-accent to-accent-2 text-accent-foreground shadow-md shadow-accent/25 scale-[1.02]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                <span>Store</span>
              </button>

              {/* Donator Page Button */}
              <button
                type="button"
                onClick={() => handleSwitchPage('donator')}
                data-testid="header-donator-nav-btn"
                aria-current={currentView === 'donator' ? 'page' : undefined}
                className={`flex items-center justify-center sm:justify-start gap-1.5 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wide whitespace-nowrap transition-[transform,box-shadow] duration-150 cursor-pointer ${
                  currentView === 'donator'
                    ? 'bg-gradient-to-r from-[#c0782f] via-[#e6a147] to-purple-500 text-slate-950 shadow-md shadow-amber-500/30 scale-[1.02]'
                    : 'text-amber-300/90 hover:text-amber-200 hover:bg-white/5'
                }`}
              >
                <Crown className={`w-3.5 h-3.5 shrink-0 ${currentView === 'donator' ? 'text-slate-950' : 'text-amber-400'}`} />
                <span>Donator</span>
              </button>

              {/* Staff Team Tab Button */}
              <button
                type="button"
                onClick={() => handleSwitchPage('staff')}
                aria-current={currentView === 'staff' ? 'page' : undefined}
                className={`flex items-center justify-center sm:justify-start gap-1.5 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wide whitespace-nowrap transition-[transform,box-shadow] duration-150 cursor-pointer ${
                  currentView === 'staff'
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/25 scale-[1.02]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                }`}
              >
                <Shield className="w-3.5 h-3.5 shrink-0" />
                <span>Staff Team</span>
              </button>

              {/* Updates Page Button */}
              <button
                type="button"
                onClick={() => handleSwitchPage('updates')}
                aria-current={currentView === 'updates' ? 'page' : undefined}
                className={`flex items-center justify-center sm:justify-start gap-1.5 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wide whitespace-nowrap transition-[transform,box-shadow] duration-150 cursor-pointer ${
                  currentView === 'updates'
                    ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/25 scale-[1.02]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                }`}
              >
                <Radio className={`w-3.5 h-3.5 shrink-0 ${currentView === 'updates' ? 'text-white' : 'text-accent'}`} />
                <span>Updates</span>
              </button>
            </div>
          </div>

          {/* Right Column: Vote, Support, Cart on one horizontal row */}
          <div className="flex flex-nowrap items-center justify-center sm:justify-start xl:justify-end gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenVote}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-rose px-3 sm:px-3.5 py-2 text-[11px] sm:text-xs font-extrabold uppercase tracking-wide text-rose-foreground whitespace-nowrap shrink-0 transition-transform hover:-translate-y-0.5 active:translate-y-0 shadow-sm cursor-pointer"
            >
              <VoteIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Vote</span>
            </button>

            <button
              type="button"
              onClick={onOpenSupport}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-deep px-3 sm:px-3.5 py-2 text-[11px] sm:text-xs font-extrabold uppercase tracking-wide text-foreground whitespace-nowrap shrink-0 transition-transform hover:-translate-y-0.5 active:translate-y-0 hover:border-border-strong cursor-pointer"
            >
              <HeartHandshake className="w-3.5 h-3.5 text-accent shrink-0" />
              <span>Support</span>
              {user && supportUnreadTotal > 0 && (
                <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-black text-white leading-tight">
                  {supportUnreadTotal}
                </span>
              )}
            </button>

            {/* Cart [N] Button beside Support */}
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              aria-label={`Open Cart, ${totalCount} items`}
              className={`flex items-center justify-center gap-1.5 rounded-xl bg-sky px-3 sm:px-3.5 py-2 text-[11px] sm:text-xs font-extrabold uppercase tracking-wide text-sky-foreground whitespace-nowrap shrink-0 transition-transform hover:-translate-y-0.5 active:translate-y-0 shadow-sm cursor-pointer ${
                cartBouncing ? 'cart-bounce ring-2 ring-sky' : ''
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
              <span>Cart [{totalCount}]</span>
            </button>
          </div>
        </div>
      </nav>

      {/* SECONDARY BOX DIRECTLY UNDERNEATH FOR ACCOUNT & SESSION */}
      <div className="relative z-20 mx-3 xl:mx-auto mt-2.5 max-w-[1240px] rounded-2xl border border-border bg-surface-deep p-3.5 sm:p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="h-9 w-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
            <User className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider text-foreground">
                Player Account &amp; Orders Hub
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase">
                {user ? 'Connected' : 'Guest Session'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground font-medium mt-0.5 leading-snug">
              {user ? `Signed in as ${user.email || username || 'Player'}` : 'Log in or register with email & password to track your order history.'}
            </p>
          </div>
        </div>

        <div className="flex flex-row flex-nowrap items-center justify-center sm:justify-end gap-1.5 sm:gap-2 w-full sm:w-auto shrink-0 overflow-x-auto no-scrollbar py-0.5">
          {user ? (
            <>
              {onOpenWallet && (
                <button
                  type="button"
                  onClick={onOpenWallet}
                  data-testid="header-wallet-btn"
                  className="flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/15 px-2.5 sm:px-3.5 py-2 text-[11px] sm:text-xs font-extrabold uppercase tracking-wide text-amber-300 whitespace-nowrap shrink-0 transition-transform hover:-translate-y-0.5 active:translate-y-0 hover:border-amber-400 cursor-pointer shadow-sm h-9"
                >
                  <Wallet className="w-3.5 h-3.5 shrink-0" />
                  <span>Wallet: ₹{wallet?.balance ?? 0}</span>
                </button>
              )}

              <button
                type="button"
                onClick={onOpenAccount}
                data-testid="header-account-btn"
                className="flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-2.5 sm:px-3.5 py-2 text-[11px] sm:text-xs font-extrabold uppercase tracking-wide text-sky-400 whitespace-nowrap shrink-0 transition-transform hover:-translate-y-0.5 active:translate-y-0 hover:border-sky-500/50 cursor-pointer shadow-sm h-9"
              >
                <User className="w-3.5 h-3.5 shrink-0" />
                <span>
                  My Account<span className="hidden sm:inline"> &amp; Orders</span>
                </span>
                {supportUnreadTotal > 0 && (
                  <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-black text-white leading-tight">
                    {supportUnreadTotal}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={async () => {
                  await logout();
                  success('Signed out successfully');
                }}
                className="flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs font-extrabold uppercase tracking-wide text-red-400 whitespace-nowrap shrink-0 transition-transform hover:-translate-y-0.5 active:translate-y-0 hover:border-red-500/50 cursor-pointer shadow-sm h-9"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenLogin}
              className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-accent-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0 shadow-sm cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Log In / Register (Email &amp; Password)</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Sliding Server Announcement Bar (Admin Configurable) */}
      {(config.showAnnouncements !== false) && (config.announcements || RECENT_PURCHASES_TICKER).length > 0 && (
        <div className="recent-purchases-ticker mt-4 border-y border-amber-500/20 bg-surface-deep/90 backdrop-blur-md shadow-inner" aria-label="Server Announcement">
          <div 
            className="recent-purchases-track py-2.5"
            style={{
              animationDuration: config.announcementSpeed === 'slow' ? '48s' : config.announcementSpeed === 'fast' ? '18s' : '32s'
            }}
          >
            {(() => {
              const list = (config.announcements && config.announcements.length > 0) ? config.announcements : RECENT_PURCHASES_TICKER;
              const repeatedList = [...list, ...list, ...list];
              return repeatedList.map((msg, index) => (
                <span
                  key={`${msg}-${index}`}
                  className="flex shrink-0 items-center gap-2 px-8 text-xs sm:text-sm font-black tracking-wide text-amber-300 hover:text-amber-200 transition-colors cursor-default"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" aria-hidden="true" />
                  <span>{msg}</span>
                </span>
              ));
            })()}
          </div>
        </div>
      )}
    </header>
  );
};
