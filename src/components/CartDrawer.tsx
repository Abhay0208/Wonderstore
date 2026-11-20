import React, { useState, useEffect } from 'react';
import { useCart, formatIgnForEdition } from '../context/CartContext';
import { useSale } from '../context/SaleContext';
import { useToast } from '../context/ToastContext';
import { useWallet } from '../context/WalletContext';
import { useAuth } from '../context/AuthContext';
import { formatINR } from '../config/storeDefaults';
import { X, Trash2, Plus, Minus, Tag, ArrowRight, ShoppingBag, ShieldCheck, User as UserIcon, Check, Wallet } from 'lucide-react';

interface CartDrawerProps {
  onOpenLogin: (msg?: string) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ onOpenLogin }) => {
  const {
    items,
    isCartOpen,
    setIsCartOpen,
    removeItem,
    updateQty,
    clearCart,
    subtotal,
    saleDiscount,
    couponDiscount,
    finalTotal,
    username,
    setUsername,
    edition,
    couponCode,
    couponPercent,
    applyCoupon,
    removeCoupon,
    setIsUpiModalOpen,
    setDirectBuyItem,
  } = useCart();

  const { saleConfig } = useSale();
  const { success } = useToast();
  const { user } = useAuth();
  const { wallet } = useWallet();
  const [couponInput, setCouponInput] = useState('');
  const [editingIgn, setEditingIgn] = useState(false);
  const [tempIgn, setTempIgn] = useState(username);

  useEffect(() => {
    setTempIgn(username);
  }, [username]);

  useEffect(() => {
    if (!isCartOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsCartOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCartOpen, setIsCartOpen]);

  if (!isCartOpen) return null;

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (applyCoupon(couponInput)) {
      setCouponInput('');
    }
  };

  const handleSaveIgn = () => {
    const raw = tempIgn.trim();
    if (raw) {
      const clean = formatIgnForEdition(raw, edition);
      setUsername(clean);
      setEditingIgn(false);
      success(`Updated recipient IGN: ${clean}`);
    } else {
      setEditingIgn(false);
    }
  };

  const handleProceedToUpi = () => {
    setDirectBuyItem(null); // Full cart checkout
    setIsCartOpen(false);
    setIsUpiModalOpen(true);
  };

  const uniquePackageCount = items.length;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={() => setIsCartOpen(false)} />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-4 sm:pl-10">
        <div className="w-full max-w-md h-full max-h-[100dvh] bg-[#3b111a] border-l border-[#6e2231] shadow-2xl flex flex-col text-white font-sans">
          {/* Drawer Header (Matches PokenMC screenshot 3) */}
          <div className="flex items-center justify-between p-5 border-b border-[#5a1b28] bg-[#2f0c14]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#521723] text-[#f3a847] border border-[#752435] shadow-inner">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight text-white font-display">
                  Your Shopping Cart
                </h2>
                <p className="text-xs text-rose-200/70 font-medium">
                  {uniquePackageCount} {uniquePackageCount === 1 ? 'unique package' : 'packages'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsCartOpen(false)}
              className="p-2 rounded-xl text-rose-200/60 hover:text-white hover:bg-[#521723] transition-colors"
              aria-label="Close cart"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Recipient IGN Banner */}
          <div className="p-4 bg-[#2f0c14]/80 border-b border-[#5a1b28]">
            <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-[#4b1622] border border-[#6b2031]">
              <div className="flex items-center gap-2.5 min-w-0">
                <UserIcon className="w-4 h-4 text-[#f3a847] shrink-0" />
                {editingIgn ? (
                  <input
                    type="text"
                    autoFocus
                    value={tempIgn}
                    onChange={(e) => setTempIgn(e.target.value)}
                    placeholder="Enter Minecraft IGN"
                    className="bg-[#2a0b12] border border-[#6b2031] rounded-lg px-2 py-1 text-xs text-white font-mono font-bold outline-none focus:border-[#f3a847] w-36"
                  />
                ) : (
                  <span className="text-xs font-bold truncate">
                    Recipient:{' '}
                    <strong className="text-[#f3a847] font-mono">
                      {username ? `@${username}` : '(IGN not set)'}
                    </strong>
                  </span>
                )}
              </div>

              {editingIgn ? (
                <button
                  type="button"
                  onClick={handleSaveIgn}
                  className="text-xs font-black text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-1 rounded-lg hover:bg-emerald-900 transition-colors shrink-0 flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  <span>Save</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingIgn(true)}
                  className="text-xs font-black text-[#f3a847] hover:underline shrink-0"
                >
                  {username ? 'Change' : 'Set IGN'}
                </button>
              )}
            </div>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3">
            {items.length === 0 ? (
              <div className="py-20 text-center">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-[#4b1622] flex items-center justify-center text-rose-300/40 border border-[#6b2031] mb-4">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-white mb-1">Your cart is empty</h3>
                <p className="text-xs text-rose-200/60 mb-6">
                  Add ranks, coins, or crate keys to get started!
                </p>
                <button
                  type="button"
                  onClick={() => setIsCartOpen(false)}
                  className="rounded-xl bg-gradient-to-r from-[#c0782f] to-[#e6a147] px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg hover:brightness-110 transition-all cursor-pointer"
                >
                  Browse Store
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl border border-[#6b2031] bg-[#4a1622] shadow-md space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="inline-block px-2 py-0.5 rounded bg-[#2c0b12] text-[#f3a847] border border-[#6b2031] text-[9.5px] font-black uppercase tracking-wider mb-1.5">
                          {item.name.toLowerCase().includes('rank') ? 'RANKS' : 'PACKAGE'}
                        </span>
                        <h4 className="text-sm font-black text-white font-display">
                          {item.name}
                        </h4>
                        <div className="text-xs font-bold text-[#f3a847] mt-0.5">
                          {formatINR(item.price)} each
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-rose-300/60 hover:text-rose-400 p-1 transition-colors"
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#5a1b28]">
                      {/* Quantity Controls */}
                      <div className="flex items-center rounded-xl border border-[#6b2031] bg-[#2f0c14]">
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, item.qty - 1)}
                          className="p-1.5 text-rose-300/70 hover:text-white transition-colors"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center text-xs font-bold font-mono text-white">
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, item.qty + 1)}
                          className="p-1.5 text-rose-300/70 hover:text-white transition-colors"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Total price for item */}
                      <div className="text-sm font-black text-white font-display">
                        {formatINR(item.price * item.qty)}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="pt-1 text-right">
                  <button
                    type="button"
                    onClick={clearCart}
                    className="text-xs text-rose-300/60 hover:text-rose-400 underline decoration-dotted transition-colors"
                  >
                    Clear all items
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Checkout Summary & Coupon */}
          {items.length > 0 && (
            <div className="border-t border-[#5a1b28] bg-[#2f0c14] p-5 space-y-4">
              {/* Coupon Code Input */}
              {couponCode ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl border border-emerald-500/40 bg-emerald-950/40 text-xs">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <Tag className="w-3.5 h-3.5" />
                    <span>Coupon "{couponCode}" applied ({couponPercent > 0 ? `${couponPercent}% OFF` : 'Discount Applied'})</span>
                  </div>
                  <button
                    type="button"
                    onClick={removeCoupon}
                    className="text-rose-300 hover:text-white text-xs underline ml-2"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplyCoupon} className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder="Coupon code (e.g. WONDER10)"
                    className="flex-1 rounded-xl border border-[#6b2031] bg-[#4a1622] px-3.5 py-2.5 text-xs text-white outline-none focus:border-[#f3a847] uppercase font-mono placeholder:normal-case placeholder:font-sans placeholder:text-rose-200/40"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-[#521723] px-4 py-2.5 text-xs font-extrabold uppercase text-white border border-[#752435] hover:bg-[#681d2e] transition-all cursor-pointer"
                  >
                    Apply
                  </button>
                </form>
              )}

              {/* Price Breakdown */}
              <div className="space-y-2 border-t border-[#5a1b28] pt-3 text-xs">
                <div className="flex justify-between text-rose-200/70">
                  <span>Subtotal:</span>
                  <span className="font-mono text-white font-bold">{formatINR(subtotal)}</span>
                </div>

                {saleConfig.enabled && saleDiscount > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Sale Discount ({saleConfig.percent}% OFF):</span>
                    <span className="font-mono">-{formatINR(saleDiscount)}</span>
                  </div>
                )}

                {couponDiscount > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Coupon ({couponPercent}% OFF):</span>
                    <span className="font-mono">-{formatINR(couponDiscount)}</span>
                  </div>
                )}

                <div className="flex justify-between text-base font-black text-white pt-2 border-t border-[#5a1b28]">
                  <span>Total Due:</span>
                  <span className="text-xl text-[#f3a847] font-display">{formatINR(finalTotal)}</span>
                </div>

                {user && (
                  <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-200">
                    <span className="flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-amber-300" />
                      <span>Available Wallet Balance</span>
                    </span>
                    <span className="font-mono font-black text-amber-300">
                      {wallet?.balance ?? 0} Credits ({formatINR(wallet?.balance ?? 0)})
                    </span>
                  </div>
                )}
              </div>

              {/* Checkout Button */}
              <button
                type="button"
                onClick={handleProceedToUpi}
                className="w-full rounded-2xl bg-gradient-to-r from-[#d88934] via-[#e6a147] to-[#d88934] py-3.5 text-xs sm:text-sm font-black uppercase tracking-wider text-slate-950 transition-all duration-200 hover:brightness-110 active:scale-[0.99] flex items-center justify-center gap-2 shadow-xl shadow-amber-950/40 cursor-pointer font-display"
              >
                <ShieldCheck className="w-4 h-4 fill-slate-950/20" />
                <span>PROCEED TO WONDERPAY CHECKOUT</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <p className="text-[10px] text-center text-rose-200/50 leading-tight">
                WonderPay Verified Checkout • Instant Discord Bot Ticket
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
