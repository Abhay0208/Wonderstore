import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { signInWithGoogle } from '../lib/firebase';
import { getFriendlyAuthError } from '../utils/authHelpers';
import { useCart, MinecraftEdition, formatIgnForEdition } from '../context/CartContext';
import { useSale } from '../context/SaleContext';
import { useStoreConfig } from '../context/StoreConfigContext';
import { useTickets } from '../context/TicketContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import { useWallet } from '../context/WalletContext';
import { formatINR } from '../config/storeDefaults';
import { sendPaymentDiscordNotification } from '../utils/discordWebhook';
import { calculateCombinedCheckoutBreakdown } from '../utils/walletPaymentHelpers';
import type { CheckoutPaymentMode } from '../types';
import { EditionSelector } from './EditionSelector';
import {
  X,
  Copy,
  Check,
  CheckCircle2,
  ExternalLink,
  QrCode,
  ShieldCheck,
  AlertCircle,
  MessageSquare,
  Upload,
  Image as ImageIcon,
  FileCheck,
  Trash2,
  ArrowRight,
  RefreshCw,
  Clock,
  User as UserIcon,
  ShieldAlert,
  Smartphone,
  CheckSquare,
  Square,
  Sparkles,
  Wallet,
  Coins,
  Loader2,
  PlusCircle,
} from 'lucide-react';

interface UpiPaymentModalProps {
  onRequireLogin?: (msg?: string) => void;
}

export const UpiPaymentModal: React.FC<UpiPaymentModalProps> = ({ onRequireLogin }) => {
  const {
    isUpiModalOpen,
    setIsUpiModalOpen,
    directBuyItem,
    setDirectBuyItem,
    walletRechargeAmount,
    setWalletRechargeAmount,
    items,
    finalTotal,
    username,
    setUsername,
    discordTag,
    setDiscordTag,
    edition,
    setEdition,
    clearCart,
  } = useCart();

  const { getItemPricing } = useSale();
  const { config } = useStoreConfig();
  const { createTicket } = useTickets();
  const { user } = useAuth();
  const { addOrder, refreshOrders } = useOrders();
  const {
    wallet,
    recordManualUpiRecharge,
    purchaseWithFullWallet,
    recordManualUpiCheckout,
  } = useWallet();
  const { success, error } = useToast();

  // Wizard Step: 1 = Player & Payment Method, 2 = Scan & Pay (Manual UPI QR), 3 = Confirmation / Tracking
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const modalBodyRef = React.useRef<HTMLDivElement>(null);

  // Payment mode selection
  const [paymentMode, setPaymentMode] = useState<CheckoutPaymentMode>('direct_online');
  const [verifiedCompletion, setVerifiedCompletion] = useState<{
    kind: 'checkout' | 'recharge';
    orderNumber: string;
    paymentId: string;
    transactionId: string;
    totalAmount: number;
    walletUsed: number;
    onlinePaid: number;
    paymentMethodLabel: string;
    newWalletBalance?: number;
  } | null>(null);

  // Order ID generation
  const [orderId, setOrderId] = useState<string>('');
  const [orderTime, setOrderTime] = useState<string>('');
  const [submitTime, setSubmitTime] = useState<string>('');

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [copiedOrderId, setCopiedOrderId] = useState(false);

  // Form states
  const [ign, setIgn] = useState(username);
  const [inputDiscord, setInputDiscord] = useState(discordTag || 'nox_boy2');
  const [isDiscordVerified, setIsDiscordVerified] = useState(true);
  const [isNoticeAccepted, setIsNoticeAccepted] = useState(true);

  const [utrNumber, setUtrNumber] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState<string>('');
  const [screenshotFileName, setScreenshotFileName] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isUrlInputOpen, setIsUrlInputOpen] = useState<boolean>(false);
  const [customScreenshotUrlInput, setCustomScreenshotUrlInput] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedUtr, setSubmittedUtr] = useState('');
  const [submittedScreenshot, setSubmittedScreenshot] = useState<string>('');

  // Close handler
  const handleClose = () => {
    setIsUpiModalOpen(false);
    setDirectBuyItem(null);
    setWalletRechargeAmount(null);
    setCurrentStep(1);
    setOrderId('');
    setUtrNumber('');
    setScreenshotUrl('');
    setScreenshotFileName('');
    setVerifiedCompletion(null);
    setIsSubmitting(false);
  };

  // Close on Escape key & lock body scroll while modal is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isUpiModalOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    if (isUpiModalOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = prevOverflow;
      };
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isUpiModalOpen]);

  // Reset modal scroll position to top when step changes or modal opens
  useEffect(() => {
    if (isUpiModalOpen && modalBodyRef.current) {
      modalBodyRef.current.scrollTop = 0;
    }
  }, [currentStep, isUpiModalOpen]);

  // Calculate checkout mode
  const isWalletRecharge = Boolean(walletRechargeAmount && walletRechargeAmount > 0);

  // Sync IGN, Discord, and default payment mode whenever modal opens
  useEffect(() => {
    if (isUpiModalOpen) {
      setIgn(username);
      if (discordTag) setInputDiscord(discordTag);
      if (isWalletRecharge) {
        setPaymentMode('direct_online');
      }

      // Generate Order / Reference ID if empty
      if (!orderId) {
        const dateStr = new Date().toISOString().replace(/-/g, '').slice(0, 8);
        const randomHash = Math.random().toString(36).substring(2, 6).toUpperCase();
        setOrderId(`${isWalletRecharge ? 'WRC' : 'WKP'}-${dateStr}-${randomHash}`);
        setOrderTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    }
  }, [username, discordTag, isUpiModalOpen, isWalletRecharge]);

  // Calculate checkout details
  const isDirect = !isWalletRecharge && Boolean(directBuyItem);
  const totalAmount = isWalletRecharge
    ? Number(walletRechargeAmount)
    : isDirect
    ? getItemPricing(directBuyItem!).discountedPrice
    : finalTotal;

  const availableWalletBalance = user ? wallet?.balance ?? 0 : 0;
  const checkoutBreakdown = isWalletRecharge
    ? {
        valid: totalAmount >= 1,
        mode: 'direct_online' as CheckoutPaymentMode,
        totalAmount,
        walletUsed: 0,
        onlineDue: totalAmount,
        walletRemainingAfter: availableWalletBalance,
      }
    : calculateCombinedCheckoutBreakdown(
        totalAmount,
        availableWalletBalance,
        paymentMode
      );
  const effectiveOnlineDue =
    !isWalletRecharge && paymentMode === 'full_wallet' ? 0 : checkoutBreakdown.onlineDue;

  const orderDescription = isWalletRecharge
    ? `WonderMC Wallet Recharge (${totalAmount} Credits)`
    : isDirect
    ? directBuyItem!.title
    : items.map((i) => `${i.qty}x ${i.name}`).join(', ');

  const itemsList = isWalletRecharge
    ? [{ name: `WonderMC Wallet Recharge (${totalAmount} Credits)`, price: totalAmount, qty: 1, category: '1 Credit = ₹1 INR' }]
    : isDirect
    ? [{ name: directBuyItem!.title, price: getItemPricing(directBuyItem!).discountedPrice, qty: 1, category: directBuyItem!.category || 'Ranks' }]
    : items.map((i) => ({ name: i.name, price: i.price, qty: i.qty, category: 'Package' }));

  const checkoutCartLines = isDirect
    ? [
        {
          id: directBuyItem!.id,
          name: directBuyItem!.title,
          price: getItemPricing(directBuyItem!).discountedPrice,
          image: directBuyItem!.image_url,
          qty: 1,
        },
      ]
    : items;

  // Generate QR code when reaching step 2 (uses remaining effectiveOnlineDue for combined UPI QR)
  useEffect(() => {
    if (!isUpiModalOpen || currentStep !== 2) return;
    if (effectiveOnlineDue <= 0) return;

    if (config.qrMode === 'custom' && config.customQrUrl) {
      setQrDataUrl(config.customQrUrl);
      return;
    }

    const upiUri = `upi://pay?pa=${encodeURIComponent(config.upiId)}&pn=${encodeURIComponent(
      config.upiPayeeName || config.brand
    )}&am=${effectiveOnlineDue}&cu=INR&tn=${encodeURIComponent(
      orderDescription.slice(0, 40)
    )}`;

    QRCode.toDataURL(upiUri, {
      width: 280,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code', err));
  }, [isUpiModalOpen, currentStep, effectiveOnlineDue, orderDescription, config.qrMode, config.customQrUrl, config.upiId, config.upiPayeeName, config.brand]);

  if (!isUpiModalOpen) return null;

  const handleEditionChange = (newEd: MinecraftEdition) => {
    setEdition(newEd);
    if (newEd === 'bedrock') {
      setIgn((prev) => {
        const trimmed = (prev || username || '').trim();
        if (!trimmed) return '.';
        return trimmed.startsWith('.') ? trimmed : `.${trimmed.replace(/^\.+/, '')}`;
      });
    } else {
      setIgn((prev) => (prev || username || '').replace(/^\.+/, ''));
    }
  };

  const handleCopyUpiId = async () => {
    try {
      await navigator.clipboard.writeText(config.upiId);
      setCopiedUpi(true);
      success(`Copied UPI ID: ${config.upiId}`);
      setTimeout(() => setCopiedUpi(false), 2000);
    } catch {
      error(`UPI ID: ${config.upiId}`);
    }
  };

  const handleCopyOrderId = async () => {
    try {
      await navigator.clipboard.writeText(orderId);
      setCopiedOrderId(true);
      success(`Copied Order ID: ${orderId}`);
      setTimeout(() => setCopiedOrderId(false), 2000);
    } catch {}
  };

  const handleScreenshotFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      error('Please select a valid image file (PNG, JPG, WEBP)');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      error('Image file size must be smaller than 8MB');
      return;
    }
    setIsUploading(true);
    setScreenshotFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      setScreenshotUrl(reader.result as string);
      setIsUploading(false);
      success('Payment screenshot attached!');
    };
    reader.onerror = () => {
      setIsUploading(false);
      error('Failed to read payment screenshot image');
    };
    reader.readAsDataURL(file);
  };

  // Step 1 -> Execute Full Wallet or Proceed to WonderPay UPI QR Scan & Pay
  const handleProceedToScanAndPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNoticeAccepted) {
      error('Please check the Mandatory Customer Notice checkbox before proceeding!');
      return;
    }

    const cleanDiscord = inputDiscord.trim().replace(/^@+/, '');
    setDiscordTag(cleanDiscord);

    // Wallet Recharge Path (WonderPay UPI QR)
    if (isWalletRecharge) {
      if (!user) {
        error('Please sign in to your account to add Wallet Credits.');
        onRequireLogin?.('Sign in to recharge your WonderMC Wallet.');
        return;
      }

      setCurrentStep(2);
      return;
    }

    const rawIgn = ign.trim();
    if (!rawIgn || rawIgn === '.') {
      error('Please enter your Minecraft In-Game Name (IGN)');
      return;
    }

    const cleanIgn = formatIgnForEdition(rawIgn, edition);
    setUsername(cleanIgn);

    // 1. Wallet or Combined require signed-in account
    if (paymentMode === 'full_wallet' || paymentMode === 'combined') {
      if (!user) {
        error('Please sign in to your account to pay using Wallet Credits.');
        onRequireLogin?.('Sign in to use your WonderMC Wallet Credits during checkout.');
        return;
      }
      if (!checkoutBreakdown.valid) {
        error(checkoutBreakdown.error || 'Unable to process wallet breakdown.');
        return;
      }
    }

    // 2. Full Wallet Purchase (or Combined where wallet covers 100%)
    if (paymentMode === 'full_wallet' || (paymentMode === 'combined' && checkoutBreakdown.onlineDue <= 0)) {
      setIsSubmitting(true);
      try {
        const res = await purchaseWithFullWallet({
          totalAmount,
          items: checkoutCartLines,
          ign: cleanIgn,
          edition,
          orderNumber: orderId,
        });
        setVerifiedCompletion({
          kind: 'checkout',
          orderNumber: res.order.orderNumber,
          paymentId: res.payment.id,
          transactionId: res.payment.transactionId,
          totalAmount: res.order.totalAmount,
          walletUsed: res.order.walletUsed || res.order.totalAmount,
          onlinePaid: 0,
          paymentMethodLabel: 'Full Wallet Credits (Verified)',
        });
        if (!isDirect) clearCart();
        await refreshOrders();
        setCurrentStep(3);
        success(`Order ${res.order.orderNumber} paid with Wallet Credits!`);
      } catch (err: any) {
        error(err?.message || 'Wallet checkout failed.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // 3. WonderPay Manual UPI QR (Direct or Combined remainder)
    setCurrentStep(2);
  };

  // Step 2 -> Step 3 Manual UPI QR Submission
  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUtr = utrNumber.trim();
    const cleanScreenshot = screenshotUrl.trim();

    if (!cleanUtr || cleanUtr.length < 10) {
      error('Please enter a valid 12-digit UPI Reference / UTR Number');
      return;
    }

    setIsSubmitting(true);
    const rawFallbackIgn = ign.trim() || user?.displayName || 'Player';
    const cleanIgn = formatIgnForEdition(rawFallbackIgn, edition) || rawFallbackIgn;
    const cleanDiscord = inputDiscord.trim().replace(/^@+/, '');

    try {
      if (isWalletRecharge) {
        const rechargeRes = await recordManualUpiRecharge({
          amount: totalAmount,
          utr: cleanUtr,
          screenshotUrl: cleanScreenshot || undefined,
          ign: cleanIgn,
          orderNumber: orderId,
        });

        setSubmittedUtr(cleanUtr);
        setSubmittedScreenshot(cleanScreenshot);
        setSubmitTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setCurrentStep(3);

        if (user) {
          const attachments = cleanScreenshot
            ? [
                {
                  fileName: screenshotFileName || 'wallet_recharge_receipt.png',
                  mimeType: 'image/png',
                  sizeBytes: Math.min(cleanScreenshot.length, 4 * 1024 * 1024),
                  dataUrl: cleanScreenshot,
                },
              ]
            : [];
          void createTicket({
            subject: `Wallet Recharge ₹${totalAmount} (${totalAmount} Credits) · UTR: ${cleanUtr}`,
            category: 'Payment & Billing',
            priority: 'high',
            description: `Recharge Ref: ${rechargeRes.recharge.rechargeRef}\nCredits Requested: ${totalAmount} Credits (₹${totalAmount})\nUTR/Transaction ID: ${cleanUtr}\nAccount: ${user.email || cleanIgn}\nDiscord/Contact: ${cleanDiscord}`,
            ign: cleanIgn,
            attachments,
          }).catch(() => undefined);
        }

        success('Wallet recharge proof submitted successfully!');
        return;
      }

      const apiRes = await recordManualUpiCheckout({
        mode: paymentMode === 'combined' ? 'combined' : 'direct_online',
        totalAmount,
        items: checkoutCartLines,
        ign: cleanIgn,
        edition,
        orderNumber: orderId,
        utr: cleanUtr,
        screenshotUrl: cleanScreenshot || undefined,
      }).catch(() => null);

      setSubmittedUtr(cleanUtr);
      setSubmittedScreenshot(cleanScreenshot);
      setSubmitTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setCurrentStep(3);

      let generatedTicketNumber: string | undefined;
      if (user) {
        const attachments = cleanScreenshot
          ? [
              {
                fileName: screenshotFileName || 'payment_receipt.png',
                mimeType: 'image/png',
                sizeBytes: Math.min(cleanScreenshot.length, 4 * 1024 * 1024),
                dataUrl: cleanScreenshot,
              },
            ]
          : [];
        void createTicket({
          subject: `UPI Payment ₹${effectiveOnlineDue} · UTR: ${cleanUtr}`,
          category: 'Payment & Billing',
          priority: 'high',
          description: `Order ID: ${orderId}\nOrder Item(s): ${orderDescription}\nOrder Total: ₹${totalAmount}\nWallet Used: ₹${checkoutBreakdown.walletUsed}\nUPI Paid: ₹${effectiveOnlineDue}\nUTR/Transaction ID: ${cleanUtr}\nMinecraft IGN: ${cleanIgn} (${edition === 'bedrock' ? 'Bedrock Edition' : 'Java Edition'})\nDiscord Tag: ${cleanDiscord}`,
          ign: cleanIgn,
          attachments,
        })
          .then((created) => {
            generatedTicketNumber = created.ticketNumber;
          })
          .catch(() => undefined);
      }

      if (!apiRes) {
        addOrder({
          ign: cleanIgn,
          userId: user?.uid || `guest_${cleanIgn}`,
          items: checkoutCartLines,
          totalAmount,
          currency: 'INR',
          status: 'pending',
          paymentMethod: checkoutBreakdown.walletUsed > 0 ? 'wallet+upi_qr' : 'upi_qr',
          walletUsed: checkoutBreakdown.walletUsed,
          onlinePaid: effectiveOnlineDue,
          utr: cleanUtr,
          orderNumber: orderId,
          screenshotUrl: cleanScreenshot || undefined,
          edition,
        });
      } else {
        await refreshOrders();
      }

      sendPaymentDiscordNotification(
        {
          ign: cleanIgn,
          utr: cleanUtr,
          amount: effectiveOnlineDue,
          itemsDescription: `${orderDescription}${
            checkoutBreakdown.walletUsed > 0 ? ` (Wallet ₹${checkoutBreakdown.walletUsed} + UPI ₹${effectiveOnlineDue})` : ''
          }`,
          contact: cleanDiscord || undefined,
          screenshotUrl: cleanScreenshot || undefined,
          ticketNumber: generatedTicketNumber,
          gamemode: config.serverName,
          serverIp: config.serverIp,
          paymentMethod: `UPI QR (${config.upiId})`,
          edition,
        },
        config
      ).catch((err) => console.warn('[Discord Payment Webhook]', err));

      if (!isDirect) {
        clearCart();
      }
      success('Payment proof submitted successfully!');
    } catch (err: any) {
      error(err?.message || 'Failed to submit payment proof.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cleanIgnDisplay = formatIgnForEdition(ign || user?.displayName || 'Steve', edition);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wonderpay-modal-title"
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-2 sm:p-6 overflow-hidden bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      {/* Clickable Backdrop */}
      <div 
        className="fixed inset-0"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Box matching PokenMC wine red theme */}
      <div className="relative z-10 flex flex-col w-full max-w-2xl max-h-[92dvh] sm:max-h-[90dvh] overflow-hidden rounded-2xl sm:rounded-3xl border-2 border-[#752635] bg-[#3b1219] shadow-2xl shadow-black/80 text-white font-sans">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-2.5 border-b border-[#5e1927] px-3.5 sm:px-7 py-3 sm:py-4 bg-[#3b1219] shrink-0 z-20">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-[#581c27] text-[#f3a847] border border-[#752635] shadow-inner shrink-0">
              <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h2 id="wonderpay-modal-title" className="text-base sm:text-2xl font-black tracking-wide text-white font-display uppercase leading-none">
                  WONDERPAY
                </h2>
                <span className="rounded-full bg-[#581c27] border border-[#f3a847]/40 px-2 py-0.5 text-[8.5px] sm:text-[9.5px] font-black text-[#f3a847] uppercase tracking-wider whitespace-nowrap shrink-0">
                  VERIFIED GATEWAY
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-rose-200/70 font-medium truncate mt-0.5">
                Official WonderMC Secure Checkout &amp; Order Management
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-2xl text-rose-200/70 hover:text-white hover:bg-[#581c27] border border-transparent hover:border-[#752635] transition-colors cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div ref={modalBodyRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 sm:p-7">
        {/* 3-Step Progress Stepper Bar (Exact PokenMC Design) */}
        <div className="flex items-center justify-between bg-[#2a0b11] p-2.5 sm:p-3 rounded-2xl border border-[#5e1927] mb-5 text-[9.5px] sm:text-xs font-black uppercase tracking-wider gap-1">
          <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-center sm:text-left shrink-0">
            <div className={`flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[10px] sm:text-[11px] font-mono font-black shrink-0 ${
              currentStep === 1
                ? 'bg-[#f3a847] text-slate-950 font-bold'
                : 'bg-emerald-500 text-white'
            }`}>
              1
            </div>
            <span className={`whitespace-nowrap ${currentStep === 1 ? 'text-[#f3a847]' : 'text-emerald-400'}`}>
              Player<span className="hidden sm:inline"> &amp; Account</span>
            </span>
          </div>

          <div className="h-0.5 flex-1 mx-1 sm:mx-3 bg-[#5e1927] min-w-[12px]" />

          <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-center sm:text-left shrink-0">
            <div className={`flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[10px] sm:text-[11px] font-mono font-black shrink-0 ${
              currentStep === 2
                ? 'bg-[#f3a847] text-slate-950 font-bold'
                : currentStep > 2
                ? 'bg-emerald-500 text-white'
                : 'bg-[#48141f] text-rose-200/50'
            }`}>
              2
            </div>
            <span className={`whitespace-nowrap ${currentStep === 2 ? 'text-[#f3a847]' : currentStep > 2 ? 'text-emerald-400' : 'text-rose-200/50'}`}>
              Scan &amp; Pay
            </span>
          </div>

          <div className="h-0.5 flex-1 mx-1 sm:mx-3 bg-[#5e1927] min-w-[12px]" />

          <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-center sm:text-left shrink-0">
            <div className={`flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[10px] sm:text-[11px] font-mono font-black shrink-0 ${
              currentStep === 3
                ? 'bg-[#f3a847] text-slate-950 font-bold'
                : 'bg-[#48141f] text-rose-200/50'
            }`}>
              3
            </div>
            <span className={`whitespace-nowrap ${currentStep === 3 ? 'text-[#f3a847]' : 'text-rose-200/50'}`}>
              <span className="hidden sm:inline">Live </span>Tracking
            </span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* STEP 1: DISCORD & ACCOUNT VERIFICATION */}
        {/* ========================================================================= */}
        {currentStep === 1 && (
          <form onSubmit={handleProceedToScanAndPay} className="space-y-4 sm:space-y-5">
            {/* ORDER SUMMARY CARD */}
            <div className="rounded-2xl border border-[#752635] bg-[#2a0b11] p-3.5 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black uppercase text-rose-200/70 border-b border-[#5e1927] pb-2">
                <span>
                  {isWalletRecharge
                    ? 'WALLET RECHARGE SUMMARY'
                    : `ORDER SUMMARY (${itemsList.length} ITEM${itemsList.length === 1 ? '' : 'S'})`}
                </span>
                <span className="whitespace-nowrap">Currency: <strong className="text-white">INR</strong></span>
              </div>

              <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                {itemsList.map((it, idx) => (
                  <div key={idx} className="flex items-start sm:items-center justify-between gap-3 text-xs font-bold">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                      <span className="text-[#f3a847] font-mono font-black shrink-0">{it.qty}x</span>
                      <span className="text-white font-display text-sm break-words">{it.name}</span>
                      <span className="px-2 py-0.5 rounded bg-[#581c27] text-[9px] text-[#f3a847] uppercase whitespace-nowrap shrink-0">
                        {it.category}
                      </span>
                    </div>
                    <span className="font-mono text-white text-sm tabular-nums shrink-0">{formatINR(it.price * it.qty)}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#5e1927] text-base font-black">
                <span>Total Payable:</span>
                <span className="text-xl sm:text-2xl text-[#f3a847] font-display tabular-nums shrink-0">{formatINR(totalAmount)}</span>
              </div>
            </div>

            {/* OPTIONAL GOOGLE ACCOUNT & CONTACT CARD */}
            <div className="rounded-2xl border border-[#752635] bg-[#2a0b11] p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-[#f3a847]">
                  <Sparkles className="w-4 h-4 text-[#f3a847]" />
                  <span>ACCOUNT &amp; CONTACT DETAILS (OPTIONAL)</span>
                </div>

                {!user ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await signInWithGoogle();
                        success('Logged in with Google!');
                      } catch (err: any) {
                        if (err?.code !== 'auth/cancelled-popup-request') {
                          error(getFriendlyAuthError(err, 'google'));
                        }
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white text-slate-950 font-bold text-xs flex items-center gap-1.5 hover:bg-slate-100 transition-all cursor-pointer shadow-sm"
                  >
                    <img
                      src="https://www.google.com/favicon.ico"
                      alt="Google"
                      referrerPolicy="no-referrer"
                      className="w-4 h-4"
                    />
                    <span>Log in to Save Orders</span>
                  </button>
                ) : (
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5 max-w-full min-w-0">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{user.email || 'Google Account Connected'}</span>
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#3c121b] border border-[#611c2a]">
                <div className="flex-1 min-w-0">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-rose-200/70 mb-1">
                    Contact Handle / Discord / Phone (Optional)
                  </label>
                  <input
                    type="text"
                    value={inputDiscord}
                    onChange={(e) => setInputDiscord(e.target.value)}
                    placeholder="e.g. @yourname or phone number"
                    className="w-full bg-[#1d070b] border border-[#611c2a] rounded-xl px-3 py-2 text-xs text-white font-mono font-bold outline-none focus:border-[#f3a847]"
                  />
                  <span className="text-[10px] text-rose-200/50 mt-1 block">
                    Used by staff to contact you if any delivery assistance is required.
                  </span>
                </div>
              </div>
            </div>

            {/* TARGET MINECRAFT ACCOUNT OR LINKED WALLET ACCOUNT CARD */}
            {isWalletRecharge ? (
              <div className="rounded-2xl border border-[#752635] bg-[#2a0b11] p-3.5 sm:p-5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-black uppercase text-[#f3a847]">
                    <PlusCircle className="w-4 h-4 text-[#f3a847] shrink-0" />
                    <span>CREDIT DESTINATION WALLET</span>
                  </div>
                  <span className="rounded-lg bg-amber-500/15 border border-amber-400/35 px-2.5 py-0.5 text-[10px] font-mono font-black text-amber-300 whitespace-nowrap shrink-0">
                    1 Credit = ₹1 INR
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#1d070b] border border-[#611c2a] p-3 text-xs">
                  <div className="min-w-0">
                    <span className="text-rose-200/60 block text-[10px] font-black uppercase">Account</span>
                    <strong className="text-white font-mono break-all">{user?.email || user?.displayName || 'Signed In Player'}</strong>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <span className="text-rose-200/60 block text-[10px] font-black uppercase">Projected Balance</span>
                    <strong className="text-emerald-400 font-mono tabular-nums">
                      {availableWalletBalance} → {availableWalletBalance + totalAmount} Credits
                    </strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-[#752635] bg-[#2a0b11] p-3.5 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-black uppercase text-[#f3a847]">
                    <UserIcon className="w-4 h-4 text-[#f3a847] shrink-0" />
                    <span>TARGET MINECRAFT ACCOUNT</span>
                  </div>
                  <div className="flex rounded-lg bg-[#3c121b] p-0.5 border border-[#611c2a] shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEditionChange('java')}
                      className={`min-h-[36px] px-3 py-1 rounded-md text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                        edition === 'java' ? 'bg-[#f3a847] text-slate-950 shadow-sm' : 'text-rose-200/60 hover:text-white'
                      }`}
                    >
                      Java
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditionChange('bedrock')}
                      className={`min-h-[36px] px-3 py-1 rounded-md text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                        edition === 'bedrock' ? 'bg-[#f3a847] text-slate-950 shadow-sm' : 'text-rose-200/60 hover:text-white'
                      }`}
                    >
                      Bedrock
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-[#3c121b] border border-[#611c2a] flex items-center justify-center overflow-hidden shrink-0">
                    <img
                      src={`https://mc-heads.net/avatar/${cleanIgnDisplay.replace(/^\.+/, '')}/48`}
                      alt="Minecraft Head"
                      className="h-10 w-10 [image-rendering:pixelated]"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://mc-heads.net/avatar/steve/48';
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-rose-200/70 mb-1">
                      MINECRAFT IN-GAME NAME (IGN) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={ign}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (edition === 'bedrock' && val && !val.startsWith('.')) {
                          val = `.${val.replace(/^\.+/, '')}`;
                        }
                        setIgn(val);
                        setUsername(val);
                      }}
                      placeholder={edition === 'bedrock' ? '.BedrockPlayerName' : 'JavaPlayerName'}
                      className="w-full rounded-xl border border-[#611c2a] bg-[#1d070b] px-3.5 py-2 text-sm text-white font-mono font-extrabold outline-none focus:border-[#f3a847]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* PAYMENT METHOD MODE SELECTOR (UPI Only for Wallet Recharge; UPI / Full Wallet / Combined for Store Orders) */}
            <div className="rounded-2xl border border-[#752635] bg-[#2a0b11] p-3.5 sm:p-5 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-[#f3a847]">
                  <Wallet className="w-4 h-4 text-[#f3a847] shrink-0" />
                  <span>{isWalletRecharge ? 'SELECT UPI PAYMENT METHOD' : 'SELECT PAYMENT OPTION'}</span>
                </div>
                {user ? (
                  <span
                    data-testid="checkout-wallet-balance"
                    className="rounded-lg bg-amber-500/15 border border-amber-400/35 px-2.5 py-1 text-[11px] font-mono font-black text-amber-300 max-w-full"
                  >
                    Wallet Balance: {availableWalletBalance} Credits ({formatINR(availableWalletBalance)})
                  </span>
                ) : (
                  <span className="text-[11px] text-rose-200/70 font-bold">
                    {isWalletRecharge ? 'Sign in to add Wallet Credits' : 'Sign in to pay with Wallet Credits'}
                  </span>
                )}
              </div>

              {!isWalletRecharge ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMode('direct_online')}
                    data-testid="checkout-mode-direct"
                    className={`w-full min-h-[44px] rounded-xl border p-3 text-left transition-all cursor-pointer ${
                      paymentMode === 'direct_online'
                        ? 'border-[#f3a847] bg-[#581c27] shadow-md'
                        : 'border-[#611c2a] bg-[#1d070b] hover:border-[#f3a847]/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-black text-white">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Direct UPI</span>
                    </div>
                    <p className="text-[10.5px] text-rose-200/70 mt-1 leading-snug">
                      Pay {formatINR(totalAmount)} directly via WonderPay UPI QR
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMode('full_wallet')}
                    data-testid="checkout-mode-wallet"
                    className={`w-full min-h-[44px] rounded-xl border p-3 text-left transition-all cursor-pointer ${
                      paymentMode === 'full_wallet'
                        ? 'border-[#f3a847] bg-[#581c27] shadow-md'
                        : 'border-[#611c2a] bg-[#1d070b] hover:border-[#f3a847]/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-black text-white">
                      <Coins className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                      <span>Full Wallet</span>
                    </div>
                    <p className="text-[10.5px] text-rose-200/70 mt-1 leading-snug">
                      Pay {totalAmount} Credits instantly (1 Credit = ₹1)
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMode('combined')}
                    data-testid="checkout-mode-combined"
                    className={`w-full min-h-[44px] rounded-xl border p-3 text-left transition-all cursor-pointer ${
                      paymentMode === 'combined'
                        ? 'border-[#f3a847] bg-[#581c27] shadow-md'
                        : 'border-[#611c2a] bg-[#1d070b] hover:border-[#f3a847]/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-black text-white">
                      <Wallet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Wallet + UPI</span>
                    </div>
                    <p className="text-[10.5px] text-rose-200/70 mt-1 leading-snug">
                      Use available credits + pay remaining via UPI
                    </p>
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-[#f3a847] bg-[#581c27] p-3 text-left flex flex-wrap items-center justify-between gap-2.5 shadow-md">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-black text-white">UPI Payment Only</div>
                      <p className="text-[10.5px] text-rose-200/75 leading-snug">
                        Pay {formatINR(totalAmount)} via WonderPay UPI QR &amp; submit UTR proof
                      </p>
                    </div>
                  </div>
                  <span className="rounded bg-[#2a0b11] border border-[#f3a847]/40 px-2 py-0.5 text-[10px] font-black uppercase text-[#f3a847] whitespace-nowrap shrink-0">
                    +{totalAmount} Credits
                  </span>
                </div>
              )}

              {/* Dynamic Breakdown Summary */}
              {!checkoutBreakdown.valid ? (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/50 p-3 text-xs text-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{checkoutBreakdown.error}</span>
                </div>
              ) : (
                <div className="rounded-xl border border-[#611c2a] bg-[#1d070b] p-3 text-xs space-y-1 font-mono">
                  <div className="flex justify-between gap-2 text-rose-200/80">
                    <span>{isWalletRecharge ? 'Wallet Credits Added:' : 'Product Price:'}</span>
                    <strong className="text-white text-right tabular-nums">
                      {isWalletRecharge ? `${totalAmount} Credits (${formatINR(totalAmount)})` : formatINR(checkoutBreakdown.totalAmount)}
                    </strong>
                  </div>
                  {!isWalletRecharge && paymentMode !== 'direct_online' && (
                    <div className="flex justify-between gap-2 text-amber-300">
                      <span>Wallet Credits Applied:</span>
                      <strong className="text-right tabular-nums">
                        -{formatINR(checkoutBreakdown.walletUsed)} ({checkoutBreakdown.walletUsed} Cr)
                      </strong>
                    </div>
                  )}
                  <div className="flex justify-between gap-2 text-emerald-300 pt-1 border-t border-[#5e1927]">
                    <span>{isWalletRecharge ? 'UPI Amount Payable:' : 'Remaining UPI Payment:'}</span>
                    <strong className="text-right tabular-nums">{formatINR(checkoutBreakdown.onlineDue)}</strong>
                  </div>
                </div>
              )}

            </div>

            {/* MANDATORY CUSTOMER NOTICE CHECKBOX */}
            <button
              type="button"
              role="checkbox"
              aria-checked={isNoticeAccepted}
              data-testid="checkout-notice-checkbox"
              onClick={() => setIsNoticeAccepted(!isNoticeAccepted)}
              className="w-full text-left rounded-2xl border border-[#752635] bg-[#2a0b11] p-3.5 sm:p-4 flex items-start gap-3 cursor-pointer hover:border-[#f3a847]/50 transition-colors"
            >
              <div className="mt-0.5 text-[#f3a847] shrink-0">
                {isNoticeAccepted ? (
                  <CheckSquare className="w-5 h-5 text-[#f3a847]" />
                ) : (
                  <Square className="w-5 h-5 text-rose-200/40" />
                )}
              </div>
              <p className="text-xs text-rose-200/80 leading-relaxed font-medium">
                <strong className="text-white">Mandatory Customer Notice:</strong>{' '}
                {isWalletRecharge
                  ? 'I confirm the recharge amount is correct. WonderPay UPI QR recharges are reviewed by staff once your UTR reference and payment proof are submitted.'
                  : 'I confirm that my Minecraft username is correct. Orders using verified Wallet Credits are confirmed automatically; WonderPay UPI QR orders are reviewed by staff once payment proof is submitted.'}
              </p>
            </button>

            {/* SUBMIT BUTTON */}
            <button
              type="submit"
              disabled={isSubmitting || (!isWalletRecharge && (paymentMode === 'full_wallet' || paymentMode === 'combined') && Boolean(user) && !checkoutBreakdown.valid)}
              data-testid="checkout-proceed-btn"
              className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-[#c0782f] via-[#e6a147] to-[#c0782f] px-4 py-3.5 sm:py-4 text-xs sm:text-sm font-black uppercase tracking-wider text-slate-950 transition-all duration-200 hover:brightness-110 active:scale-[0.99] flex items-center justify-center gap-2 text-center leading-snug shadow-xl shadow-amber-950/50 cursor-pointer disabled:opacity-50 font-display"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>{isWalletRecharge ? 'PREPARING UPI QR...' : 'PROCESSING CHECKOUT...'}</span>
                </>
              ) : isWalletRecharge ? (
                <>
                  <PlusCircle className="w-4 h-4 shrink-0" />
                  <span>CONFIRM &amp; PAY VIA UPI ({formatINR(totalAmount)})</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </>
              ) : paymentMode === 'full_wallet' ? (
                <>
                  <Coins className="w-4 h-4 shrink-0" />
                  <span>PAY {totalAmount} WALLET CREDITS ({formatINR(totalAmount)})</span>
                </>
              ) : paymentMode === 'combined' ? (
                <>
                  <Wallet className="w-4 h-4 shrink-0" />
                  <span>
                    USE {checkoutBreakdown.walletUsed} CREDITS + PAY {formatINR(checkoutBreakdown.onlineDue)} UPI
                  </span>
                </>
              ) : (
                <>
                  <span>CONFIRM PLAYER &amp; PAY ({formatINR(totalAmount)})</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </>
              )}
            </button>
          </form>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: SCAN & PAY (UPI QR & UTR FORM) */}
        {/* ========================================================================= */}
        {currentStep === 2 && (
          <form onSubmit={handleSubmitProof} className="space-y-4 sm:space-y-5">
            {/* ORDER ID BANNER */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl border border-[#752635] bg-[#2a0b11]">
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-200/70 block mb-0.5">
                  GENERATED WONDERPAY ORDER ID
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm sm:text-base font-black text-[#f3a847] break-all">{orderId}</span>
                  <button
                    type="button"
                    onClick={handleCopyOrderId}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded bg-[#3c121b] text-rose-200/70 hover:text-white cursor-pointer shrink-0"
                    title="Copy Order ID"
                    aria-label="Copy Order ID"
                  >
                    {copiedOrderId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="text-left sm:text-right shrink-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-200/70 block mb-0.5">
                  {checkoutBreakdown.walletUsed > 0 ? 'REMAINING UPI AMOUNT DUE' : 'AMOUNT TO PAY'}
                </span>
                <span className="text-xl font-black text-[#f3a847] font-display tabular-nums">
                  {formatINR(effectiveOnlineDue)}
                </span>
                {checkoutBreakdown.walletUsed > 0 && (
                  <span className="block text-[10px] font-mono text-emerald-300 tabular-nums">
                    (Wallet Credits Applied: {formatINR(checkoutBreakdown.walletUsed)})
                  </span>
                )}
              </div>
            </div>

            {/* QR CODE PRESENTATION CARD */}
            <div className="rounded-2xl border-2 border-[#752635] bg-[#2a0b11] p-3.5 sm:p-5 text-center space-y-4">
              <div className="mx-auto bg-white p-2.5 sm:p-4 rounded-2xl shadow-xl w-fit max-w-full overflow-hidden border-2 border-white">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="UPI Payment QR Code"
                    className="w-44 h-44 sm:w-52 sm:h-52 object-contain mx-auto block rounded-lg [image-rendering:pixelated]"
                  />
                ) : (
                  <div className="w-44 h-44 sm:w-52 sm:h-52 flex items-center justify-center text-xs text-gray-500 font-mono">
                    Generating QR Code...
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-[#3c121b] border border-[#611c2a] text-xs text-rose-200/80 leading-relaxed text-left flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#f3a847] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-white">Manual Amount Entry Notice:</strong> Important: This is a verified static merchant QR. Please manually enter the exact remaining due (<strong>{formatINR(effectiveOnlineDue)}</strong>) in your payment app before confirming.
                </span>
              </div>

              {/* UPI ID ROW */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#1d070b] border border-[#611c2a]">
                <div className="text-left min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-200/60 block">
                    VERIFIED STORE UPI ID
                  </span>
                  <span className="font-mono text-sm font-black text-white break-all">{config.upiId}</span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                  <a
                    href={`upi://pay?pa=${config.upiId}&pn=${config.brand}&am=${effectiveOnlineDue}&cu=INR`}
                    className="flex-1 sm:flex-none min-h-[44px] px-3.5 py-2 rounded-xl bg-[#581c27] hover:bg-[#681d2e] border border-[#752635] text-xs font-black text-white flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-[#f3a847] shrink-0" />
                    <span>Pay via App</span>
                  </a>

                  <button
                    type="button"
                    onClick={handleCopyUpiId}
                    className="flex-1 sm:flex-none min-h-[44px] px-3.5 py-2 rounded-xl bg-[#3c121b] hover:bg-[#4a1622] border border-[#611c2a] text-xs font-black text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {copiedUpi ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 text-[#f3a847] shrink-0" />}
                    <span>{copiedUpi ? 'Copied' : 'Copy UPI'}</span>
                  </button>
                </div>
              </div>

              {/* QUICK STEPS */}
              <div className="text-left text-xs space-y-1.5 pt-2 border-t border-[#5e1927]">
                <span className="text-[10px] font-black uppercase text-[#f3a847] tracking-wider block mb-2">
                  QUICK STEPS:
                </span>
                <ol className="space-y-1 text-rose-200/80 leading-relaxed font-medium list-decimal list-inside break-words">
                  <li>Open any UPI app (Google Pay, PhonePe, Paytm, CRED, BHIM) or mobile banking.</li>
                  <li>Scan the verified WonderPay QR code above or pay directly to the UPI ID.</li>
                  <li>Enter the exact amount due (<strong>{formatINR(effectiveOnlineDue)}</strong>) shown in your checkout summary.</li>
                  <li>Complete the transaction and copy your 12-digit UTR / UPI Reference Number.</li>
                  <li>Upload your payment confirmation screenshot and paste your UTR below.</li>
                  <li>Our Discord bot will instantly open your private priority order ticket!</li>
                </ol>
              </div>
            </div>

            {/* STEP 2 FORM: UTR & SCREENSHOT */}
            <div className="rounded-2xl border border-[#752635] bg-[#2a0b11] p-3.5 sm:p-5 space-y-4">
              <span className="text-xs font-black uppercase tracking-wider text-[#f3a847] block">
                STEP 2: CONFIRM TRANSACTION &amp; SUBMIT PROOF
              </span>

              <div>
                <label className="block text-xs font-black uppercase text-rose-200/70 mb-1">
                  TRANSACTION UTR / REFERENCE ID <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value)}
                  placeholder="Enter 12-digit UPI UTR or bank reference number"
                  maxLength={18}
                  className="w-full rounded-xl border border-[#611c2a] bg-[#1d070b] px-3.5 py-2.5 text-sm font-mono text-white outline-none focus:border-[#f3a847]"
                />
                <span className="text-[10px] text-rose-200/50 mt-1 block">
                  Found in your payment app under transaction details (e.g. UPI Ref / UTR / Txn ID).
                </span>
              </div>

              {/* UPLOAD SCREENSHOT */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label className="text-xs font-black uppercase text-rose-200/70 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-[#f3a847] shrink-0" />
                    <span>UPLOAD PAYMENT SCREENSHOT * (MAX 8MB)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsUrlInputOpen(!isUrlInputOpen)}
                    className="min-h-[32px] px-2 text-[11px] text-[#f3a847] hover:underline font-bold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {isUrlInputOpen ? 'Upload File' : 'Paste Image URL'}
                  </button>
                </div>

                {screenshotUrl ? (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 flex items-center gap-3">
                    <div className="h-14 w-14 rounded-lg border border-emerald-500/30 bg-black overflow-hidden shrink-0 flex items-center justify-center">
                      <img src={screenshotUrl} alt="Payment Receipt" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-black text-emerald-400 truncate">
                        <FileCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                        <span className="truncate">{screenshotFileName || 'Payment_Receipt.png'}</span>
                      </div>
                      <span className="text-[10px] text-rose-200/60 block mt-0.5">
                        ✓ Payment screenshot attached
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setScreenshotUrl('');
                        setScreenshotFileName('');
                        setCustomScreenshotUrlInput('');
                      }}
                      className="rounded-lg p-1.5 text-rose-300 hover:text-white transition-colors"
                      title="Remove screenshot"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : isUrlInputOpen ? (
                  <input
                    type="url"
                    value={customScreenshotUrlInput}
                    onChange={(e) => {
                      setCustomScreenshotUrlInput(e.target.value);
                      setScreenshotUrl(e.target.value);
                      setScreenshotFileName('Direct_Image_URL.png');
                    }}
                    placeholder="https://... Imgur / Discord image link"
                    className="w-full rounded-xl border border-[#611c2a] bg-[#1d070b] px-3.5 py-2.5 text-xs font-mono text-white outline-none focus:border-[#f3a847]"
                  />
                ) : (
                  <label className="group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#611c2a] hover:border-[#f3a847] bg-[#1d070b] p-5 transition-all cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleScreenshotFile(file);
                      }}
                      className="hidden"
                    />
                    <Upload className="w-6 h-6 text-[#f3a847] mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-black text-white group-hover:text-[#f3a847] transition-colors">
                      {isUploading ? 'Processing Image...' : 'Click to select payment screenshot'}
                    </span>
                    <span className="text-[10px] text-rose-200/50 mt-1">
                      PNG, JPG, or WEBP up to 8MB
                    </span>
                  </label>
                )}
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="min-h-[46px] rounded-2xl border border-[#611c2a] bg-[#2a0b11] px-5 py-3 text-xs font-black uppercase text-rose-200/70 hover:text-white transition-colors cursor-pointer"
              >
                Back to Details
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 min-h-[48px] rounded-2xl bg-gradient-to-r from-[#c0782f] via-[#e6a147] to-[#c0782f] px-4 py-3.5 text-xs sm:text-sm font-black uppercase tracking-wider text-slate-950 transition-all duration-200 hover:brightness-110 active:scale-[0.99] flex items-center justify-center gap-2 shadow-xl shadow-amber-950/50 cursor-pointer disabled:opacity-50 font-display"
              >
                {isSubmitting ? (
                  <span>Submitting Proof...</span>
                ) : (
                  <>
                    <span>SUBMIT PAYMENT PROOF</span>
                    <Check className="w-4 h-4 stroke-[3] shrink-0" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: VERIFIED GATEWAY / WALLET CONFIRMATION OR LIVE UPI TRACKING       */}
        {/* ========================================================================= */}
        {currentStep === 3 && verifiedCompletion && (
          <div className="space-y-4 sm:space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-5 rounded-2xl border border-emerald-500/40 bg-emerald-950/30 flex items-start gap-3.5">
              <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <h4 className="text-base font-black text-white font-display uppercase">
                  {verifiedCompletion.kind === 'recharge'
                    ? 'UPI Verified & Wallet Credits Added'
                    : 'Payment Verified & Order Confirmed'}
                </h4>
                <p className="text-xs text-emerald-200/90 leading-relaxed break-words">
                  {verifiedCompletion.kind === 'recharge' ? (
                    <>
                      Recharge <strong className="font-mono text-white">{verifiedCompletion.orderNumber}</strong> verified!{' '}
                      <strong className="text-white">{verifiedCompletion.totalAmount} Credits</strong> added
                      {typeof verifiedCompletion.newWalletBalance === 'number'
                        ? ` (New Balance: ${verifiedCompletion.newWalletBalance} Credits)`
                        : ''}
                      .
                    </>
                  ) : (
                    <>
                      Order <strong className="font-mono text-white">{verifiedCompletion.orderNumber}</strong> for{' '}
                      <strong className="text-white">{cleanIgnDisplay}</strong> is verified and recorded in your account.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#752635] bg-[#2a0b11] p-4 space-y-2.5 text-xs font-mono">
              <div className="flex items-start justify-between gap-3">
                <span className="text-rose-200/70 shrink-0">Payment ID:</span>
                <strong className="text-white text-right break-all">{verifiedCompletion.paymentId}</strong>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-rose-200/70 shrink-0">Transaction Reference:</span>
                <strong className="text-sky-300 text-right break-all">{verifiedCompletion.transactionId}</strong>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-rose-200/70 shrink-0">Method:</span>
                <strong className="text-white uppercase text-right">{verifiedCompletion.paymentMethodLabel}</strong>
              </div>
              {verifiedCompletion.kind !== 'recharge' && (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-rose-200/70 shrink-0">Wallet Used:</span>
                  <strong className="text-amber-300 text-right tabular-nums">{formatINR(verifiedCompletion.walletUsed)}</strong>
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <span className="text-rose-200/70 shrink-0">UPI Paid:</span>
                <strong className="text-emerald-300 text-right tabular-nums">{formatINR(verifiedCompletion.onlinePaid)}</strong>
              </div>
              <div className="flex items-start justify-between gap-3 border-t border-[#5e1927] pt-2.5 text-sm">
                <span className="text-white font-bold shrink-0">
                  {verifiedCompletion.kind === 'recharge' ? 'Credits Added:' : 'Total Order Amount:'}
                </span>
                <strong className="text-[#f3a847] text-right tabular-nums">
                  {verifiedCompletion.kind === 'recharge'
                    ? `${verifiedCompletion.totalAmount} Credits (${formatINR(verifiedCompletion.totalAmount)})`
                    : formatINR(verifiedCompletion.totalAmount)}
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              data-testid="checkout-done-btn"
              className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3.5 text-xs sm:text-sm font-black uppercase tracking-wider text-slate-950 transition-all hover:brightness-110 cursor-pointer font-display"
            >
              {verifiedCompletion.kind === 'recharge' ? 'DONE / BACK TO WALLET' : 'DONE / RETURN TO STORE'}
            </button>
          </div>
        )}

        {currentStep === 3 && !verifiedCompletion && (
          <div className="space-y-4 sm:space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* TRACKING ORDER CARD */}
            <div className="p-3.5 sm:p-5 rounded-2xl border border-[#752635] bg-[#2a0b11] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-200/70 block mb-0.5 break-all">
                  TRACKING ORDER: <strong className="text-[#f3a847] font-mono text-sm">{orderId}</strong>
                </span>
                <p className="text-xs text-rose-200/80 font-medium break-words">
                  Target: <strong className="text-white">{cleanIgnDisplay}</strong> ({edition}){inputDiscord ? ` • Contact: ${inputDiscord}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-950/80 border border-amber-500/40 text-xs font-black text-[#f3a847] whitespace-nowrap">
                  <Clock className="w-3.5 h-3.5 text-[#f3a847] animate-spin shrink-0" />
                  Proof Under Review
                </span>
                <button
                  type="button"
                  onClick={() => success('Refreshed order status!')}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl bg-[#3c121b] border border-[#611c2a] text-rose-200/70 hover:text-white cursor-pointer"
                  title="Refresh order status"
                  aria-label="Refresh order status"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ORDER PROOF SUBMITTED BANNER */}
            <div className="p-3.5 sm:p-4 rounded-2xl border border-[#752635] bg-[#2a0b11] flex items-start gap-3">
              <MessageSquare className="w-5 h-5 text-[#f3a847] shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-black text-white font-display">Order Proof Received</h4>
                  <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-[9px] font-black text-emerald-400 uppercase whitespace-nowrap">
                    Priority Queue
                  </span>
                </div>
                <p className="text-xs text-rose-200/80 leading-relaxed font-medium break-words">
                  Our staff team is reviewing your UTR ({submittedUtr}) and payment screenshot. Perks will be dispatched to in-game account <strong className="text-white">{cleanIgnDisplay}</strong> shortly.
                </p>
              </div>
            </div>

            {/* ORDER PROGRESSION TIMELINE */}
            <div className="p-3.5 sm:p-5 rounded-2xl border border-[#752635] bg-[#2a0b11] space-y-4">
              <span className="text-xs font-black uppercase tracking-wider text-[#f3a847] block">
                ORDER PROGRESSION TIMELINE
              </span>

              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#5e1927]">
                {/* Timeline Item 1 */}
                <div className="relative">
                  <span className="absolute -left-6 top-0 h-4 w-4 rounded-full bg-rose-500 border-2 border-[#2a0b11]" />
                  <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs font-black">
                    <span className="text-white">Order Created</span>
                    <span className="text-rose-200/50 font-mono text-[10px]">{orderTime}</span>
                  </div>
                  <p className="text-xs text-rose-200/70 mt-0.5 break-words">
                    Order {orderId} created for {cleanIgnDisplay}. Awaiting payment scan and proof submission.
                  </p>
                </div>

                {/* Timeline Item 2 */}
                <div className="relative">
                  <span className="absolute -left-6 top-0 h-4 w-4 rounded-full bg-rose-500 border-2 border-[#2a0b11]" />
                  <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs font-black">
                    <span className="text-white">Payment Proof Submitted</span>
                    <span className="text-rose-200/50 font-mono text-[10px]">{submitTime}</span>
                  </div>
                  <p className="text-xs text-rose-200/70 mt-0.5 break-words">
                    UTR / Ref: {submittedUtr}. Proof screenshot received. Routed to staff review queue.
                  </p>
                </div>
              </div>
            </div>

            {/* DONE BUTTON */}
            <button
              type="button"
              onClick={handleClose}
              className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-[#9c293e] via-[#631826] to-[#9c293e] hover:brightness-125 border border-[#752635] px-4 py-3.5 text-xs sm:text-sm font-black uppercase tracking-wider text-white transition-all duration-200 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer font-display"
            >
              <span>DONE / CLOSE ORDER WINDOW</span>
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
