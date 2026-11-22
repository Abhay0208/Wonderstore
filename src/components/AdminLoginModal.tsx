import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { useStoreConfig } from '../context/StoreConfigContext';
import { useTickets } from '../context/TicketContext';
import {
  StaffMember, TopBuyer, StoreItem, StoreCategory, ServerUpdate, SubAdminKey, Coupon,
  ActiveAdminSession, AdminTabPermission, ActivityLog, VoteLink, ConnectionGuide,
  RuleCategory, Order,
} from '../types';
import { AdminPanelModal } from './AdminPanelModal';
import { supportService, StaffPortalAuthResponse, setStoredStaffSession } from '../services/supportService';
import { X, Lock, KeyRound, Eye, EyeOff, ShieldCheck, User, Crown, Users } from 'lucide-react';

/**
 * All permissions (owner fallback). The authoritative permission list is
 * returned by the backend after verification — the frontend never verifies
 * credentials or grants permissions on its own.
 */
const ALL_PERMISSIONS: AdminTabPermission[] = [
  'dashboard', 'users', 'staff', 'supporters', 'categories', 'themes',
  'click_animations', 'products', 'orders', 'wallet', 'payment_management',
  'coupon_management', 'discounts', 'tickets', 'updates', 'vote', 'payment',
  'passwords', 'settings', 'activity_log', 'guide', 'rules', 'donations',
];

type LoginMode = 'owner' | 'subadmin' | 'staff';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffList: StaffMember[];
  onUpdateStaff: (staff: StaffMember[]) => void;
  onSaveStaffToBackend?: (staff?: StaffMember[]) => Promise<boolean>;
  leaderboard: TopBuyer[];
  onUpdateLeaderboard: (buyers: TopBuyer[]) => void;
  onSaveLeaderboardToBackend?: (buyers?: TopBuyer[]) => Promise<boolean>;
  items: StoreItem[];
  onUpdateItems: (items: StoreItem[]) => void;
  categories: StoreCategory[];
  onUpdateCategories?: (categories: StoreCategory[]) => void;
  onUpdateCategoriesAndItems?: (categories: StoreCategory[], items: StoreItem[]) => void;
  updatesList?: ServerUpdate[];
  onUpdateServerUpdates?: (updates: ServerUpdate[]) => void;
  subAdminKeys?: SubAdminKey[];
  onUpdateSubAdminKeys?: (keys: SubAdminKey[]) => void;
  couponsList?: Coupon[];
  onUpdateCoupons?: (coupons: Coupon[]) => void;
  activityLogs?: ActivityLog[];
  onUpdateActivityLogs?: (logs: ActivityLog[]) => void;
  voteLinks?: VoteLink[];
  onUpdateVoteLinks?: (voteLinks: VoteLink[]) => void;
  onLogActivity?: (action: string, details: string, type?: ActivityLog['type'], adminName?: string) => void;
  connectionGuide?: ConnectionGuide;
  onUpdateConnectionGuide?: (guide: ConnectionGuide) => void;
  rulesCategories?: RuleCategory[];
  onUpdateRulesCategories?: (categories: RuleCategory[]) => void;
  orders?: Order[];
  onUpdateOrders?: (orders: Order[]) => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen, onClose, staffList, onUpdateStaff, onSaveStaffToBackend, leaderboard,
  onUpdateLeaderboard, onSaveLeaderboardToBackend, items, onUpdateItems,
  categories, onUpdateCategories, onUpdateCategoriesAndItems, updatesList,
  onUpdateServerUpdates, subAdminKeys, onUpdateSubAdminKeys, couponsList,
  onUpdateCoupons, activityLogs, onUpdateActivityLogs, voteLinks, onUpdateVoteLinks,
  onLogActivity, connectionGuide, onUpdateConnectionGuide, rulesCategories,
  onUpdateRulesCategories, orders, onUpdateOrders,
}) => {
  const { config } = useStoreConfig();
  const { success, error } = useToast();
  const { logoutStaffSession } = useTickets();
  const [mode, setMode] = useState<LoginMode>('owner');
  const [accountId, setAccountId] = useState('');
  const [passkey, setPasskey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [activeSession, setActiveSession] = useState<ActiveAdminSession | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsAdminAuth(false);
      setActiveSession(null);
      setPasskey('');
      setAccountId('');
      setShowPassword(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isAdminAuth) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleExitAndClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (!isOpen) return null;

  const applyBackendSession = (res: StaffPortalAuthResponse, resolvedMode: LoginMode) => {
    // Persist the signed token (NEVER the raw password) in session storage.
    setStoredStaffSession(res);
    const permissions: AdminTabPermission[] =
      res.isAdmin || res.isOwner
        ? ALL_PERMISSIONS
        : Array.isArray((res as any).permissions)
        ? ((res as any).permissions as AdminTabPermission[])
        : ['tickets'];
    const session: ActiveAdminSession = {
      isOwner: Boolean(res.isOwner),
      name: res.isOwner ? 'Main Server Owner' : res.name,
      permissions,
    };
    setActiveSession(session);
    setIsAdminAuth(true);
    success(
      resolvedMode === 'owner'
        ? `Authenticated as ${config.brand} Main Owner!`
        : `Authenticated as ${res.name}`
    );
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPass = passkey.trim();
    if (!cleanPass || isAuthenticating) return;
    setIsAuthenticating(true);
    try {
      let res: StaffPortalAuthResponse;
      if (mode === 'owner') {
        res = await supportService.loginOwner(cleanPass);
      } else if (mode === 'subadmin') {
        const cleanId = accountId.trim();
        if (!cleanId) {
          error('Please enter your sub-admin account ID.');
          return;
        }
        res = await supportService.loginSubAdmin(cleanId, cleanPass);
      } else {
        res = await supportService.loginStaffPortal(cleanPass);
      }
      applyBackendSession(res, mode);
    } catch (err: any) {
      error(err?.message || 'Access Denied: Invalid credentials.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleExitAndClose = () => {
    setStoredStaffSession(null);
    logoutStaffSession();
    setIsAdminAuth(false);
    setActiveSession(null);
    setPasskey('');
    setAccountId('');
    setShowPassword(false);
    onClose();
  };

  const handleLogout = () => {
    handleExitAndClose();
    success('Session ended. Password required to re-enter.');
  };

  if (isAdminAuth && activeSession) {
    return (
      <AdminPanelModal
        isOpen={isOpen}
        onClose={handleExitAndClose}
        staffList={staffList}
        onUpdateStaff={onUpdateStaff}
        onSaveStaffToBackend={onSaveStaffToBackend}
        leaderboard={leaderboard}
        onUpdateLeaderboard={onUpdateLeaderboard}
        onSaveLeaderboardToBackend={onSaveLeaderboardToBackend}
        items={items}
        onUpdateItems={onUpdateItems}
        categories={categories}
        onUpdateCategories={onUpdateCategories}
        onUpdateCategoriesAndItems={onUpdateCategoriesAndItems}
        updatesList={updatesList}
        onUpdateServerUpdates={onUpdateServerUpdates}
        subAdminKeys={subAdminKeys}
        onUpdateSubAdminKeys={onUpdateSubAdminKeys}
        couponsList={couponsList}
        onUpdateCoupons={onUpdateCoupons}
        activityLogs={activityLogs}
        onUpdateActivityLogs={onUpdateActivityLogs}
        voteLinks={voteLinks}
        onUpdateVoteLinks={onUpdateVoteLinks}
        onLogActivity={onLogActivity}
        activeSession={activeSession}
        onLogout={handleLogout}
        connectionGuide={connectionGuide}
        onUpdateConnectionGuide={onUpdateConnectionGuide}
        rulesCategories={rulesCategories}
        onUpdateRulesCategories={onUpdateRulesCategories}
        orders={orders}
        onUpdateOrders={onUpdateOrders}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={handleExitAndClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl sm:p-7 my-8"
      >
        <button
          type="button"
          onClick={handleExitAndClose}
          className="absolute top-4 right-4 rounded-xl border border-border bg-surface-deep p-2 text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors cursor-pointer"
          aria-label="Close admin modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-border pb-4 mb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent border border-accent/30">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-foreground font-display">
              {config.brand} Admin Portal
            </h2>
            <p className="text-xs text-muted-foreground">Secure backend-verified sign in</p>
          </div>
        </div>

        {/* Login mode selector */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {([
            { id: 'owner', label: 'Owner', icon: Crown },
            { id: 'subadmin', label: 'Sub-Admin', icon: Users },
            { id: 'staff', label: 'Staff', icon: User },
          ] as { id: LoginMode; label: string; icon: any }[]).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { setMode(m.id); setPasskey(''); setAccountId(''); }}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-bold transition-colors cursor-pointer ${
                mode === m.id
                  ? 'bg-accent/20 border-accent text-accent'
                  : 'bg-surface-deep border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <m.icon className="w-4 h-4" />
              {m.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {mode === 'subadmin' && (
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1.5">
                Sub-Admin Account ID
              </label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="e.g. subadmin_xxx"
                autoComplete="username"
                className="w-full rounded-xl border border-border bg-surface-deep px-3 py-2.5 text-xs text-foreground outline-none focus:border-accent font-mono transition-colors"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1.5">
              {mode === 'owner' ? 'Owner Password' : mode === 'subadmin' ? 'Sub-Admin Password' : 'Staff Passkey'}
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={passkey}
                onChange={(e) => setPasskey(e.target.value)}
                placeholder="Enter your password..."
                autoFocus
                autoComplete="current-password"
                className="w-full rounded-xl border border-border bg-surface-deep pl-9 pr-10 py-2.5 text-xs text-foreground outline-none focus:border-accent font-mono transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="mt-2.5 rounded-xl border border-border/60 bg-surface-deep/60 p-3 space-y-1 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5 font-bold text-foreground">
                <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                <span>Backend-Verified Security</span>
              </div>
              <p className="leading-relaxed">
                Credentials are verified exclusively on the secure server. Only a signed,
                expiring session token is stored in your browser — never your password.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={isAuthenticating}
            className="w-full rounded-xl bg-accent py-2.5 text-xs font-black uppercase tracking-wider text-accent-foreground hover:opacity-90 transition-opacity font-display cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAuthenticating ? 'Authenticating…' : 'Authenticate & Open Panel'}
          </button>
        </form>
      </div>
    </div>
  );
};
