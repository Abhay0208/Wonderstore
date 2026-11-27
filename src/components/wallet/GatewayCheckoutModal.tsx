import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import type { GatewayOrderChallenge, GatewayPaymentMethod } from '../../types';
import { formatINR } from '../../config/storeDefaults';

export interface GatewayCheckoutModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  challenge: GatewayOrderChallenge | null;
  preferredMethod?: GatewayPaymentMethod;
  userEmail?: string;
  userName?: string;
  onAuthorizeSandbox: (
    method: GatewayPaymentMethod
  ) => Promise<{ gatewayPaymentId: string; signature: string }>;
  onPaymentSuccess: (result: {
    gatewayOrderId: string;
    gatewayPaymentId: string;
    signature: string;
    method: GatewayPaymentMethod;
  }) => Promise<void>;
  onPaymentFailure: (reason: string, cancelled: boolean) => Promise<void>;
  onClose: () => void;
}

export const GatewayCheckoutModal: React.FC<GatewayCheckoutModalProps> = ({
  isOpen,
  title,
  subtitle,
  challenge,
  userEmail,
  userName,
  onAuthorizeSandbox,
  onPaymentSuccess,
  onPaymentFailure,
  onClose,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [upiVpa, setUpiVpa] = useState('player@okaxis');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!challenge) return;
    setErrorMsg('');
    setIsProcessing(false);
  }, [challenge?.gatewayOrderId]);

  // Handle UPI sandbox payment verification
  const handleSandboxPay = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setErrorMsg('');
    try {
      const auth = await onAuthorizeSandbox('upi');
      await onPaymentSuccess({
        gatewayOrderId: challenge!.gatewayOrderId,
        gatewayPaymentId: auth.gatewayPaymentId,
        signature: auth.signature,
        method: 'upi',
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Payment verification failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSimulateFailure = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await onPaymentFailure('Simulated UPI decline from bank gateway', false);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await onPaymentFailure('Cancelled by customer before completion', true);
    } finally {
      setIsProcessing(false);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="WonderPay UPI Payment Gateway"
    >
      <div className="fixed inset-0" onClick={handleCancel} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-lg rounded-3xl border-2 border-[#752635] bg-[#3b1219] text-white shadow-2xl shadow-black/85 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 bg-[#2a0b11] border-b border-[#5e1927]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-[#581c27] border border-[#752635] flex items-center justify-center text-[#f3a847] shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black uppercase tracking-wide font-display truncate">
                  {title}
                </h3>
                <span className="px-2 py-0.5 rounded bg-[#581c27] border border-[#f3a847]/40 text-[9px] font-black uppercase text-[#f3a847]">
                  UPI TEST GATEWAY
                </span>
              </div>
              <p className="text-[11px] text-rose-200/70 truncate">
                {subtitle || `Gateway Order: ${challenge?.gatewayOrderId}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancel}
            disabled={isProcessing}
            className="p-2 rounded-xl text-rose-200/60 hover:text-white hover:bg-[#581c27] transition-colors cursor-pointer"
            aria-label="Cancel payment"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Amount Summary */}
          <div className="flex items-center justify-between rounded-2xl border border-[#752635] bg-[#2a0b11] px-4 py-3">
            <div>
              <span className="block text-[10px] font-black uppercase tracking-wider text-rose-200/70">
                Payable Amount (INR)
              </span>
              <span className="text-2xl font-black text-[#f3a847] font-display">
                {formatINR(challenge?.amountInr)}
              </span>
            </div>
            <div className="text-right">
              <span className="block text-[10px] font-black uppercase tracking-wider text-rose-200/60">
                Order Reference
              </span>
              <span className="text-xs font-mono font-bold text-white">
                {challenge?.gatewayOrderId}
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-950/60 p-3 text-xs text-rose-200">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Payment Method (UPI Only) */}
          <div className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-[#f3a847] block">
              Payment Method
            </span>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#f3a847] bg-[#581c27] p-3 text-left shadow-md">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-[#2a0b11] border border-[#752635] flex items-center justify-center shrink-0">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-white">UPI (GPay / PhonePe / Paytm)</div>
                  <div className="text-[11px] text-rose-200/75 truncate">
                    Instant UPI collect or QR intent verification
                  </div>
                </div>
              </div>
              <div className="h-4 w-4 rounded-full border-2 border-[#f3a847] bg-[#f3a847] flex items-center justify-center shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-950" />
              </div>
            </div>
          </div>

          {/* Dynamic UPI ID Input */}
          <div className="rounded-xl border border-[#611c2a] bg-[#2a0b11] p-3 space-y-2">
            <div>
              <label className="block text-[10px] font-black uppercase text-rose-200/70 mb-1">
                UPI ID / VPA (Test Collect)
              </label>
              <input
                type="text"
                value={upiVpa}
                onChange={(e) => setUpiVpa(e.target.value)}
                placeholder="yourname@okaxis"
                className="w-full rounded-lg border border-[#611c2a] bg-[#1d070b] px-3 py-2 text-xs font-mono text-white outline-none focus:border-[#f3a847]"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleSandboxPay}
              data-testid="gateway-confirm-pay-btn"
              className="w-full rounded-2xl bg-gradient-to-r from-[#c0782f] via-[#e6a147] to-[#c0782f] py-3.5 text-xs sm:text-sm font-black uppercase tracking-wider text-slate-950 hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-950/50 cursor-pointer disabled:opacity-50 font-display"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying UPI Signature...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Complete Verified UPI Payment ({formatINR(challenge?.amountInr)})
                  </span>
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleSimulateFailure}
                data-testid="gateway-simulate-fail-btn"
                className="rounded-xl border border-rose-500/40 bg-[#2a0b11] py-2.5 text-[11px] font-black uppercase tracking-wide text-rose-300 hover:bg-rose-950/70 transition-colors cursor-pointer disabled:opacity-50"
              >
                Simulate Failure
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleCancel}
                className="rounded-xl border border-[#611c2a] bg-[#2a0b11] py-2.5 text-[11px] font-black uppercase tracking-wide text-rose-200/80 hover:text-white hover:bg-[#581c27] transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel Payment
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[10px] text-rose-200/65 pt-1">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>HMAC-SHA256 Server Signature Verification • UPI Only</span>
          </div>
        </div>
      </div>
    </div>
  );
};