import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  Crown,
  Heart,
  HeartHandshake,
  ArrowLeft,
  Smartphone,
  Copy,
  Check,
  Upload,
  Image as ImageIcon,
  ShieldCheck,
  Sparkles,
  Trophy,
  Medal,
  Gift,
  Coins,
  Key,
  Swords,
  Palette,
  Star,
  AlertCircle,
  CheckCircle2,
  Clock,
  Send,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { useCart, formatIgnForEdition } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { donationService } from '../services/donationService';
import {
  formatDonationIgn,
  matchRewardTierForAmount,
  validateImagePayload,
} from '../utils/donationHelpers';
import { optimizeImage } from '../utils/imageOptimizer';
import { formatINR } from '../config/storeDefaults';
import type {
  DonationEdition,
  DonationRequest,
  DonationRewardCategory,
  DonationRewardTier,
  DonationSettings,
  PublicDonatorLeaderboardRow,
} from '../types';

interface DonatorPageProps {
  onBackToStore: () => void;
}

const DEFAULT_SETTINGS: DonationSettings = {
  enabled: true,
  leaderboardEnabled: true,
  rewardsEnabled: true,
  upiId: 'farhanastro@fam',
  upiPayeeName: 'WonderMC Network',
  qrMode: 'dynamic',
  customQrUrl: '',
  instructions:
    'Open any UPI app (Google Pay, PhonePe, Paytm, BHIM), scan the QR code or pay directly to the UPI ID, enter your exact donation amount, complete the payment, then upload your screenshot and enter your 12-digit UTR below.',
  minAmount: 0,
  thankYouMessage:
    'Your donation has been submitted successfully. Please wait while our team verifies your payment.',
  rewardsBannerMessage:
    'Support WONDER MC and get exclusive rewards as a thank you for your contribution!',
  updatedAt: new Date().toISOString(),
};

function getRewardCategoryIcon(category: DonationRewardCategory) {
  switch (category) {
    case 'Rank':
      return <Crown className="w-4 h-4 text-amber-300" />;
    case 'Coins':
      return <Coins className="w-4 h-4 text-yellow-300" />;
    case 'Keys':
      return <Key className="w-4 h-4 text-purple-300" />;
    case 'Kits':
      return <Swords className="w-4 h-4 text-rose-300" />;
    case 'Cosmetics':
      return <Palette className="w-4 h-4 text-fuchsia-300" />;
    default:
      return <Gift className="w-4 h-4 text-amber-300" />;
  }
}

export const DonatorPage: React.FC<DonatorPageProps> = ({ onBackToStore }) => {
  const { username: cartUsername, edition: cartEdition } = useCart();
  const { success, error } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<DonationSettings>(DEFAULT_SETTINGS);
  const [rewards, setRewards] = useState<DonationRewardTier[]>([]);
  const [leaderboardAllTime, setLeaderboardAllTime] = useState<PublicDonatorLeaderboardRow[]>([]);
  const [leaderboardMonthly, setLeaderboardMonthly] = useState<PublicDonatorLeaderboardRow[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<'all_time' | 'monthly'>('all_time');

  // Form states
  const [edition, setEdition] = useState<DonationEdition>(
    cartEdition === 'bedrock' ? 'bedrock' : 'java'
  );
  const [username, setUsername] = useState<string>(() =>
    cartUsername ? formatDonationIgn(cartUsername, cartEdition === 'bedrock' ? 'bedrock' : 'java') : ''
  );
  const [amountInput, setAmountInput] = useState<string>('');
  const [utrInput, setUtrInput] = useState<string>('');
  const [messageInput, setMessageInput] = useState<string>('');
  const [screenshotUrl, setScreenshotUrl] = useState<string>('');
  const [screenshotFileName, setScreenshotFileName] = useState<string>('');
  const [isUploadingSS, setIsUploadingSS] = useState(false);

  // Payment helpers
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedUpi, setCopiedUpi] = useState(false);

  // Submission & Confirmation modal
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [submittedConfirmation, setSubmittedConfirmation] = useState<{
    request: DonationRequest;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!submittedConfirmation) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSubmittedConfirmation(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [submittedConfirmation]);

  const loadPublicOverview = async () => {
    try {
      const data = await donationService.getPublicOverview();
      setSettings(data.settings);
      setRewards(data.rewards);
      setLeaderboardAllTime(data.leaderboardAllTime);
      setLeaderboardMonthly(data.leaderboardMonthly);
    } catch (err: any) {
      error(err?.message || 'Unable to load donation page details.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPublicOverview();
  }, []);

  const numericAmount = useMemo(() => {
    const parsed = parseFloat(amountInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100) / 100;
  }, [amountInput]);

  const unlockedReward = useMemo(
    () => (settings.rewardsEnabled ? matchRewardTierForAmount(numericAmount, rewards) : null),
    [numericAmount, rewards, settings.rewardsEnabled]
  );

  // Generate QR code whenever amount / settings change
  useEffect(() => {
    if (settings.qrMode === 'custom' && settings.customQrUrl) {
      setQrDataUrl(settings.customQrUrl);
      return;
    }

    const upiParams = new URLSearchParams({
      pa: settings.upiId,
      pn: settings.upiPayeeName || 'WonderMC Network',
      cu: 'INR',
      tn: 'WonderMC Server Donation',
    });
    if (numericAmount > 0) {
      upiParams.set('am', numericAmount.toString());
    }
    const upiUri = `upi://pay?${upiParams.toString()}`;

    QRCode.toDataURL(upiUri, {
      width: 240,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [settings.upiId, settings.upiPayeeName, settings.qrMode, settings.customQrUrl, numericAmount]);

  const handleEditionSwitch = (nextEdition: DonationEdition) => {
    setEdition(nextEdition);
    setUsername((prev) => (prev ? formatIgnForEdition(prev, nextEdition) : ''));
  };

  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(settings.upiId);
      setCopiedUpi(true);
      success(`Copied UPI ID: ${settings.upiId}`);
      setTimeout(() => setCopiedUpi(false), 2000);
    } catch {
      error(`UPI ID: ${settings.upiId}`);
    }
  };

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type.toLowerCase())) {
      error('Please upload a PNG, JPG, or WEBP screenshot.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      error('Screenshot file is too large (max 5MB before optimization).');
      return;
    }
    setIsUploadingSS(true);
    try {
      const optimized = await optimizeImage(file, 1200, 1600, 0.85);
      const check = validateImagePayload(optimized, { required: true, label: 'Payment screenshot' });
      if (!check.valid) {
        error(check.error || 'Screenshot validation failed.');
        return;
      }
      setScreenshotUrl(check.cleaned);
      setScreenshotFileName(file.name);
      setSubmitError('');
      success('Payment screenshot attached!');
    } catch {
      error('Failed to process screenshot. Please try another image.');
    } finally {
      setIsUploadingSS(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    const formattedIgn = formatDonationIgn(username, edition);
    if (!formattedIgn || formattedIgn.replace(/^\.+/, '').length < 2) {
      const msg = 'Please enter your valid Minecraft Username.';
      setSubmitError(msg);
      error(msg);
      return;
    }
    if (numericAmount <= 0) {
      const msg = 'Please enter any donation amount greater than ₹0.';
      setSubmitError(msg);
      error(msg);
      return;
    }
    if (settings.minAmount > 0 && numericAmount < settings.minAmount) {
      const msg = `Minimum donation amount is ₹${settings.minAmount}.`;
      setSubmitError(msg);
      error(msg);
      return;
    }
    if (!utrInput.trim() || utrInput.trim().length < 6) {
      const msg = 'Please enter your valid UPI Transaction ID / UTR.';
      setSubmitError(msg);
      error(msg);
      return;
    }
    if (!screenshotUrl) {
      const msg = 'Please upload your payment screenshot before submitting.';
      setSubmitError(msg);
      error(msg);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await donationService.submitDonation({
        username: formattedIgn,
        edition,
        amount: numericAmount,
        utr: utrInput.trim(),
        screenshotUrl,
        message: messageInput.trim() || undefined,
      });

      setSubmittedConfirmation(res);
      setAmountInput('');
      setUtrInput('');
      setMessageInput('');
      setScreenshotUrl('');
      setScreenshotFileName('');
      success('Donation submitted for verification!');
    } catch (err: any) {
      const msg = err?.message || 'Unable to submit donation request.';
      setSubmitError(msg);
      error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeLeaderboardRows =
    leaderboardTab === 'monthly' ? leaderboardMonthly : leaderboardAllTime;
  const topThree = activeLeaderboardRows.slice(0, 3);
  const otherDonors = activeLeaderboardRows.slice(3);

  const skinLookupName = (username || 'Steve').replace(/^\.+/, '') || 'Steve';
  const upiDeepLink = `upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=${encodeURIComponent(
    settings.upiPayeeName || 'WonderMC Network'
  )}${numericAmount > 0 ? `&am=${numericAmount}` : ''}&cu=INR`;

  if (isLoading) {
    return (
      <main className="relative z-10 mx-auto max-w-[1150px] px-4 py-12 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-amber-300">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-xs font-black uppercase tracking-widest">Loading WonderMC Donator Hub...</p>
        </div>
      </main>
    );
  }

  return (
    <main
      data-testid="donator-page-root"
      className="relative z-10 mx-auto max-w-[1150px] px-3.5 sm:px-5 py-6 sm:py-8 space-y-8"
    >
      {/* Hero Banner with Gold & Purple Accents */}
      <section className="relative overflow-hidden rounded-3xl border border-amber-500/35 bg-gradient-to-br from-[#120b24] via-surface-deep to-[#1d1409] p-5 sm:p-8 shadow-2xl shadow-purple-950/40">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-purple-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-amber-500/15 blur-3xl" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onBackToStore}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface/80 px-3 py-1.5 text-xs font-black uppercase text-muted-foreground hover:text-foreground hover:border-amber-400/50 transition-all cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Store</span>
              </button>
            </div>

            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-purple-600 text-slate-950 shadow-lg shadow-amber-500/30 animate-pulse">
                <Crown className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-white font-display">
                  WONDER MC <span className="text-amber-300">DONATOR</span> HUB
                </h1>
                <p className="text-xs sm:text-sm text-purple-100/85 font-medium mt-1">
                  {settings.rewardsBannerMessage ||
                    'Support WONDER MC and get exclusive rewards as a thank you for your contribution!'}
                </p>
              </div>
            </div>
          </div>


        </div>
      </section>

      {!settings.enabled ? (
        <section
          data-testid="donator-disabled-notice"
          className="rounded-3xl border border-amber-500/30 bg-surface-deep p-8 text-center space-y-3 shadow-xl"
        >
          <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-xl font-black text-foreground font-display">
            Donations Temporarily Paused
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            The donation submission portal is currently disabled by the server administrator. You can still browse the store or view server updates.
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: MANUAL UPI DONATION SUBMISSION FORM */}
          <section className="lg:col-span-6 rounded-3xl border border-amber-500/25 bg-surface p-5 sm:p-6 shadow-panel space-y-5">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/25 to-purple-500/25 border border-amber-400/40 text-amber-300">
                  <HeartHandshake className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-foreground font-display">
                    Submit Server Donation
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Pay manually via any UPI app &amp; upload your verification proof
                  </p>
                </div>
              </div>
            </div>

            {submitError && (
              <div
                role="alert"
                data-testid="donation-error-banner"
                className="rounded-2xl border border-rose-500/40 bg-rose-950/40 p-3.5 text-xs text-rose-200 flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 1. Player Identity & Edition */}
              <div className="rounded-2xl border border-border bg-surface-deep/70 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="donator-username-input"
                    className="text-xs font-black uppercase tracking-wider text-amber-300"
                  >
                    1. Minecraft Username &amp; Edition
                  </label>
                  <div className="flex rounded-lg bg-surface p-0.5 border border-border">
                    <button
                      type="button"
                      data-testid="donator-edition-java"
                      onClick={() => handleEditionSwitch('java')}
                      className={`px-3 py-1 rounded-md text-xs font-black transition-all cursor-pointer ${
                        edition === 'java'
                          ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Java
                    </button>
                    <button
                      type="button"
                      data-testid="donator-edition-bedrock"
                      onClick={() => handleEditionSwitch('bedrock')}
                      className={`px-3 py-1 rounded-md text-xs font-black transition-all cursor-pointer ${
                        edition === 'bedrock'
                          ? 'bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Bedrock
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <img
                    src={`https://mc-heads.net/avatar/${encodeURIComponent(skinLookupName)}/48`}
                    alt="Minecraft Player Head"
                    className="h-11 w-11 rounded-xl border border-amber-400/30 bg-surface [image-rendering:pixelated] shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://mc-heads.net/avatar/Steve/48';
                    }}
                  />
                  <input
                    id="donator-username-input"
                    data-testid="donator-username-input"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (edition === 'bedrock' && val && !val.startsWith('.')) {
                        val = `.${val.replace(/^\.+/, '')}`;
                      }
                      setUsername(val);
                    }}
                    placeholder={
                      edition === 'bedrock' ? '.BedrockUsername' : 'Enter Java Username'
                    }
                    className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm font-mono font-bold text-foreground outline-none focus:border-amber-400 transition-colors"
                  />
                </div>
              </div>

              {/* 2. Custom Any Donation Amount */}
              <div className="rounded-2xl border border-border bg-surface-deep/70 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="donator-amount-input"
                    className="text-xs font-black uppercase tracking-wider text-amber-300"
                  >
                    2. Enter Any Donation Amount (₹ INR)
                  </label>
                  {settings.minAmount > 0 && (
                    <span className="text-[11px] font-mono text-muted-foreground">
                      Min: ₹{settings.minAmount}
                    </span>
                  )}
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-black text-amber-300">
                    ₹
                  </span>
                  <input
                    id="donator-amount-input"
                    data-testid="donator-amount-input"
                    type="number"
                    step="0.01"
                    min={settings.minAmount > 0 ? settings.minAmount : 1}
                    required
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="Any amount (e.g. 50, 199, 500)"
                    className="w-full rounded-xl border border-border bg-surface pl-8 pr-4 py-3 text-base font-mono font-black text-foreground placeholder:text-xs sm:placeholder:text-sm outline-none focus:border-amber-400 transition-colors"
                  />
                </div>

                {unlockedReward ? (
                  <div
                    data-testid="donator-unlocked-reward-banner"
                    className="rounded-xl border border-purple-400/40 bg-purple-500/15 p-2.5 text-xs flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                      <span className="text-purple-100 truncate">
                        Eligible Reward Tier:{' '}
                        <strong className="text-amber-300">{unlockedReward.name}</strong>
                      </span>
                    </div>
                    <span className="text-[10px] font-black uppercase text-purple-200 bg-purple-500/30 px-2 py-0.5 rounded shrink-0">
                      {unlockedReward.category}
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Enter any amount you wish to support WONDER MC with — no fixed plans required.
                  </p>
                )}
              </div>

              {/* 3. Admin UPI ID, QR Code & Payment Instructions */}
              <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-[#19112c] to-surface-deep p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-purple-200">
                    3. Scan &amp; Pay via Manual UPI
                  </span>
                  <span className="text-xs font-mono font-black text-amber-300">
                    {numericAmount > 0 ? `Pay ${formatINR(numericAmount)}` : 'Any Amount'}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="bg-white p-2.5 rounded-2xl shadow-lg border-2 border-amber-300/60 shrink-0">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="WonderMC Donation UPI QR Code"
                        className="w-36 h-36 object-contain block rounded"
                      />
                    ) : (
                      <div className="w-36 h-36 flex items-center justify-center text-[11px] text-slate-600 font-mono">
                        Generating QR...
                      </div>
                    )}
                  </div>

                  <div className="flex-1 w-full space-y-2.5 text-xs">
                    <div className="rounded-xl border border-border bg-black/30 p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-black uppercase text-purple-200/70 block">
                          Official Donation UPI ID
                        </span>
                        <span
                          data-testid="donator-upi-id"
                          className="font-mono text-sm font-black text-white break-all"
                        >
                          {settings.upiId}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyUpi}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-black text-amber-200 hover:bg-amber-500/25 cursor-pointer"
                      >
                        {copiedUpi ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedUpi ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <a
                      href={upiDeepLink}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-purple-400/40 bg-purple-600/25 hover:bg-purple-600/40 px-3 py-2 text-xs font-black text-white transition-colors"
                    >
                      <Smartphone className="w-4 h-4 text-amber-300" />
                      <span>Open UPI App to Pay</span>
                    </a>

                    <p
                      data-testid="donator-instructions"
                      className="text-[11px] text-muted-foreground leading-relaxed"
                    >
                      {settings.instructions}
                    </p>
                  </div>
                </div>
              </div>

              {/* 4. Payment Screenshot, UTR & Optional Message */}
              <div className="rounded-2xl border border-border bg-surface-deep/70 p-4 space-y-4">
                <span className="text-xs font-black uppercase tracking-wider text-amber-300 block">
                  4. Payment Proof &amp; Optional Server Note
                </span>

                {/* Screenshot Upload */}
                <div>
                  <label className="block text-[11px] font-bold text-foreground mb-1.5">
                    Upload Payment Screenshot (PNG, JPG, WEBP) <span className="text-rose-400">*</span>
                  </label>
                  {screenshotUrl ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/25 p-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={screenshotUrl}
                          alt="Uploaded payment proof"
                          className="h-12 w-12 rounded-lg object-cover border border-emerald-400/40 shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-black text-emerald-300 block truncate">
                            {screenshotFileName || 'Screenshot attached'}
                          </span>
                          <span className="text-[10px] text-emerald-200/70">
                            Ready for admin review
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setScreenshotUrl('');
                          setScreenshotFileName('');
                        }}
                        className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                        aria-label="Remove screenshot"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-purple-400/35 bg-surface/60 p-5 text-center cursor-pointer hover:border-amber-400/60 transition-colors">
                      {isUploadingSS ? (
                        <Loader2 className="w-6 h-6 text-amber-300 animate-spin" />
                      ) : (
                        <Upload className="w-6 h-6 text-amber-300" />
                      )}
                      <span className="text-xs font-black text-foreground">
                        {isUploadingSS
                          ? 'Optimizing screenshot...'
                          : 'Click to upload Payment Screenshot (SS)'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        PNG, JPG or WEBP up to 3 MB
                      </span>
                      <input
                        data-testid="donator-screenshot-input"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleScreenshotUpload}
                        className="sr-only"
                      />
                    </label>
                  )}
                </div>

                {/* UTR Input */}
                <div>
                  <label
                    htmlFor="donator-utr-input"
                    className="block text-[11px] font-bold text-foreground mb-1.5"
                  >
                    UPI Transaction ID / UTR <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="donator-utr-input"
                    data-testid="donator-utr-input"
                    type="text"
                    required
                    value={utrInput}
                    onChange={(e) => setUtrInput(e.target.value)}
                    placeholder="Enter 12-digit UTR / UPI Reference ID"
                    className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm font-mono text-foreground outline-none focus:border-amber-400"
                  />
                </div>

                {/* Optional Message */}
                <div>
                  <label
                    htmlFor="donator-message-input"
                    className="block text-[11px] font-bold text-foreground mb-1.5"
                  >
                    Optional Message for Server
                  </label>
                  <textarea
                    id="donator-message-input"
                    data-testid="donator-message-input"
                    rows={2}
                    maxLength={500}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="Say hello to WonderMC or leave a shoutout note..."
                    className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-xs text-foreground outline-none focus:border-purple-400 resize-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isUploadingSS}
                data-testid="donator-submit-btn"
                className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-purple-500 px-5 py-3.5 text-sm font-black uppercase tracking-wider text-slate-950 shadow-xl shadow-amber-500/20 hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 font-display"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting Donation...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>
                      Submit Donation Request
                      {numericAmount > 0 ? ` (${formatINR(numericAmount)})` : ''}
                    </span>
                  </>
                )}
              </button>
            </form>
          </section>

          {/* RIGHT COLUMN: TOP DONATORS LEADERBOARD + AVAILABLE REWARDS */}
          <div className="lg:col-span-6 space-y-6">
            {/* TOP DONATORS LEADERBOARD */}
            {settings.leaderboardEnabled && (
              <section
                data-testid="donator-leaderboard-section"
                className="rounded-3xl border border-amber-500/30 bg-surface p-5 sm:p-6 shadow-panel space-y-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-300">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-foreground font-display">
                        Top WonderMC Donators
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Only admin-verified donations appear here
                      </p>
                    </div>
                  </div>

                  <div className="flex rounded-xl bg-surface-deep p-1 border border-border">
                    <button
                      type="button"
                      data-testid="leaderboard-tab-all-time"
                      onClick={() => setLeaderboardTab('all_time')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                        leaderboardTab === 'all_time'
                          ? 'bg-gradient-to-r from-amber-500 to-purple-600 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      All-Time
                    </button>
                    <button
                      type="button"
                      data-testid="leaderboard-tab-monthly"
                      onClick={() => setLeaderboardTab('monthly')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                        leaderboardTab === 'monthly'
                          ? 'bg-gradient-to-r from-amber-500 to-purple-600 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Monthly
                    </button>
                  </div>
                </div>

                {activeLeaderboardRows.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-surface-deep/60 p-8 text-center">
                    <Crown className="w-8 h-8 text-amber-400/50 mx-auto mb-2" />
                    <p className="text-xs font-bold text-muted-foreground">
                      No verified donations recorded for this period yet. Be the first!
                    </p>
                  </div>
                ) : (
                  <>
                    {/* TOP 1, 2, 3 SPECIAL CROWN & MEDAL CARDS */}
                    <div className="space-y-3">
                      {topThree.map((donor) => {
                        const isFirst = donor.rank === 1;
                        const isSecond = donor.rank === 2;
                        const cleanAvatarName = donor.username.replace(/^\.+/, '') || 'Steve';
                        const avatarSrc =
                          donor.avatarUrl ||
                          `https://mc-heads.net/avatar/${encodeURIComponent(cleanAvatarName)}/64`;

                        return (
                          <div
                            key={`${leaderboardTab}-${donor.id}-${donor.rank}`}
                            data-testid={`leaderboard-top-${donor.rank}`}
                            className={`relative overflow-hidden rounded-2xl border p-3.5 sm:p-4 flex items-center justify-between gap-3 transition-transform hover:-translate-y-0.5 ${
                              isFirst
                                ? 'border-amber-400/70 bg-gradient-to-r from-amber-500/20 via-surface-deep to-purple-600/20 shadow-lg shadow-amber-500/15'
                                : isSecond
                                ? 'border-slate-300/50 bg-gradient-to-r from-slate-300/10 to-surface-deep'
                                : 'border-orange-400/50 bg-gradient-to-r from-orange-500/10 to-surface-deep'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black shadow-md ${
                                  isFirst
                                    ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950 animate-pulse'
                                    : isSecond
                                    ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-950'
                                    : 'bg-gradient-to-br from-orange-300 to-amber-700 text-white'
                                }`}
                              >
                                {isFirst ? (
                                  <Crown className="w-5 h-5" />
                                ) : (
                                  <Medal className="w-5 h-5" />
                                )}
                              </div>

                              <img
                                src={avatarSrc}
                                alt={donor.username}
                                className="h-11 w-11 rounded-xl object-cover border border-white/15 shrink-0 [image-rendering:pixelated]"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    'https://mc-heads.net/avatar/Steve/64';
                                }}
                              />

                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-black text-foreground truncate">
                                    #{donor.rank} {donor.username}
                                  </span>
                                  <span className="text-[10px] font-mono uppercase text-muted-foreground">
                                    ({donor.edition})
                                  </span>
                                </div>
                                <span
                                  className={`inline-block mt-0.5 text-[11px] font-black uppercase tracking-wide ${
                                    isFirst
                                      ? 'text-amber-300'
                                      : isSecond
                                      ? 'text-slate-200'
                                      : 'text-orange-300'
                                  }`}
                                >
                                  {donor.badge}
                                </span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span
                                className={`text-base sm:text-lg font-black font-display tabular-nums ${
                                  isFirst ? 'text-amber-300' : 'text-foreground'
                                }`}
                              >
                                {formatINR(donor.amount)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* OTHER DONORS RANKED LIST */}
                    {otherDonors.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-border">
                        {otherDonors.map((donor) => {
                          const cleanAvatarName = donor.username.replace(/^\.+/, '') || 'Steve';
                          const avatarSrc =
                            donor.avatarUrl ||
                            `https://mc-heads.net/avatar/${encodeURIComponent(cleanAvatarName)}/48`;
                          return (
                            <div
                              key={`${leaderboardTab}-${donor.id}-${donor.rank}`}
                              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-deep/65 px-3.5 py-2.5"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="w-7 text-center font-mono text-xs font-black text-muted-foreground shrink-0">
                                  #{donor.rank}
                                </span>
                                <img
                                  src={avatarSrc}
                                  alt={donor.username}
                                  className="h-8 w-8 rounded-lg object-cover border border-border shrink-0 [image-rendering:pixelated]"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src =
                                      'https://mc-heads.net/avatar/Steve/48';
                                  }}
                                />
                                <div className="min-w-0">
                                  <span className="text-xs font-black text-foreground truncate block">
                                    {donor.username}
                                  </span>
                                  <span className="text-[10px] font-bold text-purple-300">
                                    {donor.badge}
                                  </span>
                                </div>
                              </div>
                              <span className="text-xs font-black font-mono text-amber-300 tabular-nums shrink-0">
                                {formatINR(donor.amount)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {/* AVAILABLE DONATOR REWARDS */}
            {settings.rewardsEnabled && (
              <section
                data-testid="donator-rewards-section"
                className="rounded-3xl border border-purple-500/30 bg-surface p-5 sm:p-6 shadow-panel space-y-4"
              >
                <div className="flex items-center gap-2.5 border-b border-border pb-3.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15 border border-purple-400/40 text-purple-300">
                    <Gift className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-foreground font-display">
                      Available Donator Rewards
                    </h2>
                    <p className="text-xs text-amber-300 font-semibold">
                      Support WONDER MC and get exclusive rewards as a thank you for your contribution!
                    </p>
                  </div>
                </div>

                {rewards.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    No reward tiers configured yet — every contribution still helps keep WonderMC online!
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {rewards.map((tier) => {
                      const isUnlocked = numericAmount > 0 && numericAmount >= tier.minAmount;
                      return (
                        <div
                          key={tier.id}
                          className={`rounded-2xl border p-4 space-y-2 transition-all hover:-translate-y-0.5 ${
                            isUnlocked
                              ? 'border-amber-400 bg-gradient-to-br from-amber-500/15 to-purple-600/20 shadow-md shadow-amber-500/15'
                              : 'border-border bg-surface-deep/75 hover:border-purple-400/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase text-purple-200">
                              {getRewardCategoryIcon(tier.category)}
                              <span>{tier.category}</span>
                            </span>
                            <span className="font-mono text-xs font-black text-amber-300">
                              {formatINR(tier.minAmount)}+
                            </span>
                          </div>
                          <h3 className="text-sm font-black text-foreground font-display">
                            {tier.name}
                          </h3>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {tier.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="rounded-xl border border-border bg-surface-deep/60 p-3 text-[11px] text-muted-foreground flex items-start gap-2">
                  <Clock className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                  <span>
                    Rewards are verified and delivered manually by our staff team after your payment screenshot &amp; UTR are approved (Reward status: <strong>PENDING</strong> → <strong>DELIVERED</strong>).
                  </span>
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {/* ATTRACTIVE DONATION SUCCESS POPUP MODAL */}
      {submittedConfirmation && (
        <div
          data-testid="donation-success-modal"
          onClick={() => setSubmittedConfirmation(null)}
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-3xl border-2 border-amber-400/60 bg-gradient-to-b from-[#1a112b] to-surface p-6 text-center shadow-2xl space-y-4"
          >
            <button
              type="button"
              onClick={() => setSubmittedConfirmation(null)}
              aria-label="Close confirmation modal"
              className="absolute top-4 right-4 rounded-xl border border-border bg-surface-deep p-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-purple-500 text-slate-950 shadow-xl shadow-amber-500/30">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-1.5">
              <span className="inline-block rounded-full bg-yellow-500/20 border border-yellow-400/40 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-yellow-300">
                Status: {submittedConfirmation.request.status}
              </span>
              <h3 className="text-xl font-black text-white font-display">
                Thank You, {submittedConfirmation.request.username}!
              </h3>
              <p className="text-xs sm:text-sm text-purple-100/90 leading-relaxed">
                {submittedConfirmation.message}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface-deep/90 p-3.5 text-xs font-mono space-y-1.5 text-left">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Reference ID:</span>
                <strong className="text-amber-300">
                  {submittedConfirmation.request.referenceNumber}
                </strong>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Amount:</span>
                <strong className="text-white">
                  {formatINR(submittedConfirmation.request.amount)}
                </strong>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">UTR / Ref:</span>
                <strong className="text-white">{submittedConfirmation.request.utr}</strong>
              </div>
              {submittedConfirmation.request.rewardName && (
                <div className="flex justify-between gap-2 pt-1 border-t border-border">
                  <span className="text-muted-foreground">Matched Reward:</span>
                  <strong className="text-purple-300">
                    {submittedConfirmation.request.rewardName} ({submittedConfirmation.request.rewardStatus})
                  </strong>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSubmittedConfirmation(null)}
              data-testid="donation-success-close-btn"
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-purple-500 py-3 text-xs font-black uppercase tracking-wider text-slate-950 hover:brightness-110 cursor-pointer font-display"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </main>
  );
};
