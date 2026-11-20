import React, { useState } from 'react';
import { StoreCategory, StoreItem, TopBuyer, Coupon } from '../types';
import { useStoreConfig } from '../context/StoreConfigContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { ProductCard } from './ProductCard';
import { TopBuyers } from './TopBuyers';
import { GamemodeSelector } from './GamemodeSelector';
import { Sparkles, Tag, Copy, Check, ArrowRight, Package, Heart, Swords, ChevronLeft } from 'lucide-react';
import { formatINR } from '../config/storeDefaults';
import { getCategoryTileClasses, getThemeMeta } from '../utils/categoryTheme';
import { getVisibleStoreCategories, getGamemodeSummaries } from '../utils/categoryManagement';

interface StoreViewProps {
  categories: StoreCategory[];
  items: StoreItem[];
  leaderboard: TopBuyer[];
  couponsList?: Coupon[];
  selectedGamemode?: string | null;
  onSelectGamemode?: (gm: string | null) => void;
  onOpenStaff?: () => void;
  onOpenLogin: (msg?: string) => void;
  isLoading?: boolean;
}

export const StoreView: React.FC<StoreViewProps> = ({
  categories,
  items,
  leaderboard,
  couponsList = [],
  selectedGamemode = null,
  onSelectGamemode,
  onOpenLogin,
  isLoading = false,
}) => {
  const { config, effectiveTheme } = useStoreConfig();
  const { applyCoupon, setIsCartOpen } = useCart();
  const { success, error } = useToast();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Only show enabled categories (and exclude legacy survival/merch)
  const validCategories = getVisibleStoreCategories(categories, selectedGamemode);
  const gamemodeSummaries = React.useMemo(
    () => getGamemodeSummaries(categories, items),
    [categories, items]
  );

  const [selectedCategoryName, setSelectedCategoryName] = useState<string>(() => {
    return validCategories[0]?.name || 'Ranks';
  });

  // Filter public (normal) active coupons only — PRIVATE coupons are NEVER shown anywhere on website
  const todayStr = new Date().toISOString().split('T')[0];
  const activePublicCoupons = couponsList.filter((c) => {
    if (c.enabled === false) return false;
    if (c.category === 'private') return false; // Private coupons remain secret
    if (c.expiryDate && c.expiryDate < todayStr) return false;
    if (typeof c.usageLimit === 'number' && c.usageLimit > 0 && (c.usedCount || 0) >= c.usageLimit) return false;
    return true;
  });

  // Keep selected category valid when gamemode changes
  React.useEffect(() => {
    if (validCategories.length > 0 && !validCategories.some((c) => c.name.toLowerCase() === selectedCategoryName.toLowerCase())) {
      setSelectedCategoryName(validCategories[0].name);
    }
  }, [validCategories, selectedCategoryName, selectedGamemode]);

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategoryName(categoryName);
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      success(`Copied promo code "${code}" to clipboard!`);
      setTimeout(() => setCopiedCode(null), 2500);
    } catch {
      error(`Promo code: ${code}`);
    }
  };

  const handleApplyPublicCoupon = (code: string) => {
    const applied = applyCoupon(code);
    if (applied) {
      setIsCartOpen(true);
    }
  };

  // Filter items by category & gamemode
  const filteredItems = items.filter((item) => {
    const matchCat = item.category.toLowerCase() === selectedCategoryName.toLowerCase();
    const catObj = categories.find(
      (c) =>
        c.name.toLowerCase() === item.category.toLowerCase() &&
        (!selectedGamemode || c.game_mode?.toLowerCase() === selectedGamemode.toLowerCase())
    );
    return (
      matchCat &&
      catObj &&
      !item.category.toLowerCase().includes('survival') &&
      item.category.toLowerCase() !== 'merch' &&
      item.category !== 'Claim Blocks'
    );
  });

  // ==========================================================
  // VIEW 1: HOME PAGE GAMEMODE SELECTOR (NO STORE ITEMS SHOWN)
  // ==========================================================
  if (!selectedGamemode) {
    return (
      <main className="relative z-10 mx-auto max-w-[1100px] px-3.5 sm:px-5 py-6 sm:py-8 space-y-8 sm:space-y-10">
        {/* PUBLIC ACTIVE COUPONS BANNER */}
        {activePublicCoupons.length > 0 && (
          <section aria-label="Available Store Coupons" className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-r from-surface-deep via-surface to-accent/10 p-4 sm:p-5 shadow-xl">
            <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-accent/10 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground font-black shadow-md shrink-0">
                  <Tag className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm sm:text-base font-black tracking-tight text-foreground font-display">
                      {getThemeMeta(effectiveTheme).couponHeading}
                    </h3>
                    <span className="rounded-full bg-accent/20 text-accent border border-accent/40 px-2.5 py-0.5 text-[10px] font-extrabold uppercase animate-pulse whitespace-nowrap shrink-0">
                      ⚡ {activePublicCoupons.length} Available
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Use these official store coupon codes at checkout to get instant discounts!
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activePublicCoupons.map((coupon) => {
                const isFixed = coupon.discountType === 'fixed';
                const val = coupon.discountValue ?? (coupon.percent || 10);
                const discountText = isFixed ? `${formatINR(val)} OFF` : `${val}% OFF`;
                const isCopied = copiedCode === coupon.code;

                return (
                  <div
                    key={coupon.id || coupon.code}
                    className="flex items-center justify-between gap-2.5 rounded-xl border border-border/80 bg-surface-deep/90 p-3 hover:border-accent/60 transition-all shadow-sm group"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono font-black text-xs text-gold tracking-wider uppercase px-2 py-0.5 rounded bg-surface border border-gold/30">
                          {coupon.code}
                        </span>
                        <span className="text-xs font-black text-accent font-display whitespace-nowrap">
                          {discountText}
                        </span>
                      </div>
                      {coupon.expiryDate && (
                        <span className="text-[10px] text-muted-foreground block truncate">
                          Valid till: {coupon.expiryDate}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopyCode(coupon.code)}
                        aria-label={`Copy promo code ${coupon.code}`}
                        title="Copy promo code"
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors cursor-pointer"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPublicCoupon(coupon.code)}
                        className="min-h-[38px] rounded-lg bg-accent/20 border border-accent/40 hover:bg-accent hover:text-accent-foreground text-accent text-[11px] font-black uppercase tracking-wider px-3 py-1.5 transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>Apply</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Gamemode Selector Section — Vertical Layout matching User Image */}
        <GamemodeSelector
          gamemodeSummaries={gamemodeSummaries}
          onSelectGamemode={onSelectGamemode}
        />

        {/* Top Buyers Leaderboard */}
        <TopBuyers buyers={leaderboard} />
      </main>
    );
  }

  // ==========================================================
  // VIEW 2: ACTIVE GAMEMODE STORE CATALOG
  // ==========================================================
  return (
    <main className="relative z-10 mx-auto max-w-[1100px] px-3.5 sm:px-5 py-6 sm:py-8 space-y-8 sm:space-y-10">
      {/* Prominent Pill-Style Gamemode Switcher & Back Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface-deep/95 border border-border p-3 sm:px-4 sm:py-2.5 rounded-2xl md:rounded-full shadow-panel">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={() => onSelectGamemode?.(null)}
            className="inline-flex items-center justify-center sm:justify-start gap-1.5 rounded-xl sm:rounded-full border border-border bg-surface px-4 py-2 text-xs font-black uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-border-strong transition-all cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] w-full sm:w-auto"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>All Modes</span>
          </button>

          <div
            role="group"
            aria-label="Switch server gamemode"
            className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-1.5 rounded-xl sm:rounded-full border border-border/80 bg-black/30 p-1.5 sm:p-1 w-full sm:w-auto"
          >
            {gamemodeSummaries.map((mode) => {
              const isSelected = selectedGamemode.toLowerCase() === mode.id.toLowerCase();
              const isCrimson = mode.accent === 'crimson';
              const isCobalt = mode.accent === 'cobalt';
              const activeClass = isCrimson
                ? 'bg-gradient-to-r from-rose-600 to-rose-500 text-white border-rose-300/70 shadow-[0_0_18px_rgba(244,63,94,0.45)]'
                : isCobalt
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white border-sky-300/70 shadow-[0_0_18px_rgba(56,189,248,0.45)]'
                : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-emerald-300/70 shadow-[0_0_18px_rgba(16,185,129,0.45)]';
              const inactiveClass = isCrimson
                ? 'border-transparent text-rose-200/80 hover:text-white hover:bg-rose-500/15'
                : isCobalt
                ? 'border-transparent text-sky-200/80 hover:text-white hover:bg-sky-500/15'
                : 'border-transparent text-emerald-200/80 hover:text-white hover:bg-emerald-500/15';

              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={isSelected}
                  data-testid={`active-gamemode-pill-${mode.id.toLowerCase()}`}
                  onClick={() => onSelectGamemode?.(mode.id)}
                  className={`inline-flex items-center justify-center gap-1 sm:gap-2 rounded-lg sm:rounded-full border px-2 sm:px-4 py-2 sm:py-1.5 text-[11px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-[38px] ${
                    isSelected ? activeClass : inactiveClass
                  }`}
                >
                  {isCrimson ? (
                    <Heart className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'fill-white/30' : ''}`} />
                  ) : isCobalt ? (
                    <Swords className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{mode.label}</span>
                  <span
                    className={`text-[10px] font-mono tabular-nums ${
                      isSelected ? 'text-white/90' : 'text-muted-foreground'
                    }`}
                  >
                    ({mode.packageCount})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-center sm:justify-start gap-2 px-2 text-xs text-muted-foreground whitespace-nowrap shrink-0">
          <span>Server:</span>
          <strong className="text-foreground font-mono">{config.serverIp}</strong>
        </div>
      </div>

      {/* PUBLIC ACTIVE COUPONS BANNER */}
      {activePublicCoupons.length > 0 && (
        <section aria-label="Available Store Coupons" className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-r from-surface-deep via-surface to-accent/10 p-4 sm:p-5 shadow-xl">
          <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-accent/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground font-black shadow-md shrink-0">
                <Tag className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm sm:text-base font-black tracking-tight text-foreground font-display">
                    {getThemeMeta(effectiveTheme).couponHeading}
                  </h3>
                  <span className="rounded-full bg-accent/20 text-accent border border-accent/40 px-2.5 py-0.5 text-[10px] font-extrabold uppercase animate-pulse whitespace-nowrap shrink-0">
                    ⚡ {activePublicCoupons.length} Available
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Use these official store coupon codes at checkout to get instant discounts!
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activePublicCoupons.map((coupon) => {
              const isFixed = coupon.discountType === 'fixed';
              const val = coupon.discountValue ?? (coupon.percent || 10);
              const discountText = isFixed ? `${formatINR(val)} OFF` : `${val}% OFF`;
              const isCopied = copiedCode === coupon.code;

              return (
                <div
                  key={coupon.id || coupon.code}
                  className="flex items-center justify-between gap-2.5 rounded-xl border border-border/80 bg-surface-deep/90 p-3 hover:border-accent/60 transition-all shadow-sm group"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-black text-xs text-gold tracking-wider uppercase px-2 py-0.5 rounded bg-surface border border-gold/30">
                        {coupon.code}
                      </span>
                      <span className="text-xs font-black text-accent font-display whitespace-nowrap">
                        {discountText}
                      </span>
                    </div>
                    {coupon.expiryDate && (
                      <span className="text-[10px] text-muted-foreground block truncate">
                        Valid till: {coupon.expiryDate}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyCode(coupon.code)}
                      aria-label={`Copy promo code ${coupon.code}`}
                      title="Copy promo code"
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors cursor-pointer"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPublicCoupon(coupon.code)}
                      className="min-h-[38px] rounded-lg bg-accent/20 border border-accent/40 hover:bg-accent hover:text-accent-foreground text-accent text-[11px] font-black uppercase tracking-wider px-3 py-1.5 transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Apply</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Category Selection Grid with Custom Gradient Tiles */}
      <section aria-label="Store Categories" className="mb-10 sm:mb-12">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-5 h-5 text-accent shrink-0" />
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-foreground font-display">
              Select Category — {selectedGamemode}
            </h2>
          </div>
          <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
            {validCategories.length} categories available
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
          {isLoading && validCategories.length === 0 ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={`cat-skeleton-${idx}`}
                className="flex flex-col items-center justify-center rounded-2xl p-3.5 sm:p-4 text-center min-h-[132px] sm:min-h-[140px] border border-border bg-surface-deep/40 animate-pulse"
              >
                <div className="relative mb-2.5 flex h-14 w-14 items-center justify-center rounded-full bg-border-strong/20" />
                <div className="h-4 w-16 bg-border-strong/30 rounded mb-2" />
                <div className="h-3 w-20 bg-border-strong/20 rounded" />
              </div>
            ))
          ) : (
            validCategories.map((category, index) => {
              const isSelected = selectedCategoryName.toLowerCase() === category.name.toLowerCase();
              const tileClasses = getCategoryTileClasses(category.theme, effectiveTheme, index);

              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => handleCategoryClick(category.name)}
                  aria-pressed={isSelected}
                  className={`${tileClasses} group relative flex flex-col items-center justify-center rounded-2xl p-3.5 sm:p-4 text-center cursor-pointer min-h-[132px] sm:min-h-[140px] border transition-all duration-300 ${
                    isSelected
                      ? 'ring-2 ring-white/90 scale-[1.03]'
                      : 'hover:scale-[1.02] opacity-90 hover:opacity-100'
                  }`}
                >
                  {category.icon && (
                    <span
                      className="absolute top-2.5 right-2.5 text-sm leading-none drop-shadow"
                      aria-hidden="true"
                    >
                      {category.icon}
                    </span>
                  )}

                  {/* Category Image Icon */}
                  <div className="relative mb-2.5 flex h-14 w-14 items-center justify-center">
                    <img
                      src={category.image_url || '/store/ranks.png'}
                      alt={category.name}
                      referrerPolicy="no-referrer"
                      className="h-12 w-12 object-contain drop-shadow-md group-hover:scale-110 transition-transform duration-200"
                    />
                  </div>

                  {/* Category Title */}
                  <span className="text-sm font-black tracking-wide text-white drop-shadow-sm font-display mb-1">
                    {category.name}
                  </span>

                  {/* Category Subtitle / Description */}
                  <span className="cat-desc text-[11px] font-semibold line-clamp-1 opacity-90">
                    {category.description}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* Packages Section */}
      <section aria-label={`${selectedCategoryName} Packages`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-deep text-accent border border-border">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-foreground font-display">
                {selectedCategoryName.toUpperCase()} PACKAGES — {selectedGamemode?.toUpperCase()}
              </h2>
              <p className="text-xs text-muted-foreground">
                Instant delivery on {config.serverIp} with live activation
              </p>
            </div>
          </div>

          <span className="rounded-full bg-surface-deep px-3.5 py-1 text-xs font-bold text-muted-foreground border border-border">
            {isLoading && filteredItems.length === 0 ? (
              <span className="inline-block w-8 h-3 bg-border rounded animate-pulse" />
            ) : (
              `${filteredItems.length} package${filteredItems.length === 1 ? '' : 's'}`
            )}
          </span>
        </div>

        {filteredItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredItems.map((item) => (
              <ProductCard key={item.id} item={item} onOpenLogin={onOpenLogin} />
            ))}
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div 
                key={`item-skeleton-${idx}`}
                className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-panel animate-pulse"
              >
                <div>
                  <div className="relative mb-4 flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-surface-deep/80">
                    <div className="h-28 w-28 rounded-full bg-border-strong/10" />
                  </div>
                  <div className="h-4.5 w-2/3 bg-border-strong/30 rounded mb-3" />
                  <div className="space-y-2">
                    <div className="h-3 w-5/6 bg-border-strong/20 rounded" />
                    <div className="h-3 w-1/2 bg-border-strong/20 rounded" />
                  </div>
                </div>
                <div className="pt-3 border-t border-border/70 mt-6">
                  <div className="flex items-baseline justify-between mb-4">
                    <div className="h-6 w-20 bg-border-strong/30 rounded" />
                    <div className="h-3.5 w-16 bg-border-strong/20 rounded" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-9 bg-surface-deep border border-border/60 rounded-xl" />
                    <div className="h-9 bg-border-strong/20 rounded-xl" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-12 text-center shadow-panel">
            <Package className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
            <h3 className="text-base font-bold text-foreground mb-1">No items available for {selectedGamemode}</h3>
            <p className="text-xs text-muted-foreground">
              Check back soon or select another category from the menu above.
            </p>
          </div>
        )}
      </section>

      {/* Top Buyers Leaderboard */}
      <TopBuyers buyers={leaderboard} />
    </main>
  );
};
