import React, { useState, useEffect } from 'react';
import { ToastProvider } from './context/ToastContext';
import { StoreConfigProvider, useStoreConfig } from './context/StoreConfigContext';
import { SaleProvider } from './context/SaleContext';
import { CartProvider } from './context/CartContext';
import { TicketProvider } from './context/TicketContext';
import { WalletProvider } from './context/WalletContext';
import { DonatorPage } from './components/DonatorPage';
import { GamingParticles } from './components/GamingParticles';
import { WinterClickEffect } from './components/PumpkinClickEffect';
import { Header } from './components/Header';
import { StoreView } from './components/StoreView';
import { CartDrawer } from './components/CartDrawer';
import { UpiPaymentModal } from './components/UpiPaymentModal';
import { VoteModal } from './components/VoteModal';
import { StaffModal } from './components/StaffModal';
import { StaffPage } from './components/StaffPage';
import { UpdatesPage } from './components/UpdatesPage';
import { HowToJoinPage } from './components/HowToJoinPage';
import { RulesPage } from './components/RulesPage';
import { SupportModal } from './components/SupportModal';
import { LegalModal, LegalDocType } from './components/LegalModal';
import { AdminLoginModal } from './components/AdminLoginModal';
import { PublicCouponsModal } from './components/PublicCouponsModal';
import { Footer } from './components/Footer';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OrderProvider, useOrders } from './context/OrderContext';
import { useCart } from './context/CartContext';
import { UserLoginModal } from './components/UserLoginModal';
import { UserAccountModal, type AccountModalTab } from './components/UserAccountModal';
import {
  INITIAL_CATEGORIES,
  INITIAL_ITEMS,
  INITIAL_LEADERBOARD,
  INITIAL_STAFF,
  INITIAL_UPDATES,
  INITIAL_SUB_ADMIN_KEYS,
  INITIAL_COUPONS,
  INITIAL_ACTIVITY_LOGS,
  INITIAL_VOTE_LINKS,
  INITIAL_CONNECTION_GUIDE,
  INITIAL_RULES_CATEGORIES,
} from './config/storeDefaults';
import { StoreCategory, StoreItem, TopBuyer, StaffMember, ServerUpdate, SubAdminKey, Coupon, ActivityLog, VoteLink, ConnectionGuide, RuleCategory, Order } from './types';
import { sortStaffByHierarchy } from './utils/staffHierarchy';
import { storageAdapter, STORAGE_KEYS } from './services/storageAdapter';
import { storeDataService } from './services/storeDataService';

const filterCleanCategories = (list: StoreCategory[]) =>
  list.filter(
    (c) =>
      c.name?.toLowerCase() !== 'merch' &&
      c.game_mode?.toLowerCase() !== 'survival' &&
      !c.name?.toLowerCase().includes('survival')
  );

const filterCleanItems = (list: StoreItem[]) =>
  list.filter(
    (i) =>
      i.category?.toLowerCase() !== 'merch' &&
      !i.category?.toLowerCase().includes('survival') &&
      i.category !== 'Claim Blocks'
  );

function MainStoreContent() {
  const [currentView, setCurrentView] = useState<'store' | 'donator' | 'staff' | 'updates' | 'join' | 'rules'>('store');
  const [isLoading] = useState(false);

  const [categories, setCategories] = useState<StoreCategory[]>(() => {
    const saved = storageAdapter.read<StoreCategory[] | null>(STORAGE_KEYS.CATEGORIES, null);
    if (Array.isArray(saved) && saved.length > 0) {
      return filterCleanCategories(saved);
    }
    return filterCleanCategories(INITIAL_CATEGORIES);
  });

  const [items, setItems] = useState<StoreItem[]>(() => {
    const saved = storageAdapter.read<StoreItem[] | null>(STORAGE_KEYS.ITEMS, null);
    if (Array.isArray(saved) && saved.length > 0) {
      return filterCleanItems(saved);
    }
    return filterCleanItems(INITIAL_ITEMS);
  });

  const [leaderboard, setLeaderboard] = useState<TopBuyer[]>(() => {
    const saved = storageAdapter.read<TopBuyer[] | null>(STORAGE_KEYS.LEADERBOARD, null);
    return Array.isArray(saved) ? saved : INITIAL_LEADERBOARD;
  });

  const [staffList, setStaffList] = useState<StaffMember[]>(() => {
    const saved = storageAdapter.read<StaffMember[] | null>(STORAGE_KEYS.STAFF, null);
    return Array.isArray(saved) ? sortStaffByHierarchy(saved) : sortStaffByHierarchy(INITIAL_STAFF);
  });

  const [updatesList, setUpdatesList] = useState<ServerUpdate[]>(() => {
    const saved = storageAdapter.read<ServerUpdate[] | null>(STORAGE_KEYS.UPDATES, null);
    return Array.isArray(saved) && saved.length > 0 ? saved : INITIAL_UPDATES;
  });

  const [subAdminKeys, setSubAdminKeys] = useState<SubAdminKey[]>(() => {
    const saved = storageAdapter.read<SubAdminKey[] | null>(STORAGE_KEYS.SUBADMIN_KEYS, null);
    return Array.isArray(saved) ? saved : INITIAL_SUB_ADMIN_KEYS;
  });

  const [couponsList, setCouponsList] = useState<Coupon[]>(() => {
    const saved = storageAdapter.read<Coupon[] | null>(STORAGE_KEYS.COUPONS, null);
    return Array.isArray(saved) ? saved : INITIAL_COUPONS;
  });

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>(() => {
    const saved = storageAdapter.read<ActivityLog[] | null>(STORAGE_KEYS.ACTIVITY_LOGS, null);
    return Array.isArray(saved) ? saved : INITIAL_ACTIVITY_LOGS;
  });

  const [voteLinks, setVoteLinks] = useState<VoteLink[]>(() => {
    const saved = storageAdapter.read<VoteLink[] | null>(STORAGE_KEYS.VOTE_LINKS, null);
    return Array.isArray(saved) ? saved : INITIAL_VOTE_LINKS;
  });

  const [connectionGuide, setConnectionGuide] = useState<ConnectionGuide>(() => {
    const saved = storageAdapter.read<ConnectionGuide | null>(STORAGE_KEYS.CONNECTION_GUIDE, null);
    return saved || INITIAL_CONNECTION_GUIDE;
  });

  const [rulesCategories, setRulesCategories] = useState<RuleCategory[]>(() => {
    const saved = storageAdapter.read<RuleCategory[] | null>(STORAGE_KEYS.RULES, null);
    return Array.isArray(saved) && saved.length > 0 ? saved : INITIAL_RULES_CATEGORIES;
  });

  // Fetch all shared data from the central backend (Supabase) on mount so that
  // every browser/device sees the same data. Never let an empty API response
  // wipe existing local cache — only apply non-empty payloads.
  useEffect(() => {
    let cancelled = false;
    storeDataService.fetchSharedData().then((data) => {
      if (cancelled) return;
      if (data.categories.length) setCategories(filterCleanCategories(data.categories));
      if (data.items.length) setItems(filterCleanItems(data.items));
      if (data.leaderboard.length) setLeaderboard(data.leaderboard);
      if (data.staff.length) setStaffList(sortStaffByHierarchy(data.staff));
      if (data.updates.length) setUpdatesList(data.updates);
      if (data.coupons.length) setCouponsList(data.coupons);
      if (data.voteLinks.length) setVoteLinks(data.voteLinks);
      if (data.rules.length) setRulesCategories(data.rules);
      if (data.guide) setConnectionGuide(data.guide);
    }).catch(() => { /* offline: retain local cache */ });
    return () => { cancelled = true; };
  }, []);

  const handleUpdateActivityLogs = (newLogs: ActivityLog[]) => {
    setActivityLogs(newLogs);
    storageAdapter.write(STORAGE_KEYS.ACTIVITY_LOGS, newLogs);
  };

  const handleLogActivity = (action: string, details: string, type: ActivityLog['type'] = 'other', adminName = 'Server Admin') => {
    const newLog: ActivityLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      action,
      adminName,
      details,
      timestamp: new Date().toISOString(),
      type,
    };
    setActivityLogs((prev) => {
      const next = [newLog, ...prev].slice(0, 200);
      storageAdapter.write(STORAGE_KEYS.ACTIVITY_LOGS, next);
      return next;
    });
  };

  // Modals state
  const [isVoteOpen, setIsVoteOpen] = useState(false);
  const [isStaffOpen, setIsStaffOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocType>(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isPublicCouponsOpen, setIsPublicCouponsOpen] = useState(false);
  const [isUserLoginOpen, setIsUserLoginOpen] = useState(false);
  const [isUserAccountOpen, setIsUserAccountOpen] = useState(false);
  const [accountInitialTab, setAccountInitialTab] = useState<AccountModalTab>('orders');
  const [loginMessage, setLoginMessage] = useState('');
  const [pendingSupportOpen, setPendingSupportOpen] = useState(false);

  const { user } = useAuth();
  const { orders } = useOrders();
  const { setIsUpiModalOpen } = useCart();
  const { effectiveTheme } = useStoreConfig();

  useEffect(() => {
    document.documentElement.setAttribute('data-store-theme', effectiveTheme);
  }, [effectiveTheme]);

  useEffect(() => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const hasActivePublic = couponsList.some(
        (c) =>
          c.enabled !== false &&
          c.category !== 'private' &&
          (!c.expiryDate || c.expiryDate >= todayStr) &&
          (!c.usageLimit || (c.usedCount || 0) < c.usageLimit)
      );
      if (hasActivePublic) {
        setIsPublicCouponsOpen(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('update') || params.get('page') === 'updates') {
        setCurrentView('updates');
      }
    } catch {
      // ignore
    }
  }, []);

  // Handlers with modular local storage persistence
  const handleUpdateStaff = (newStaff: StaffMember[]) => {
    const sorted = sortStaffByHierarchy(newStaff);
    setStaffList(sorted);
    storageAdapter.write(STORAGE_KEYS.STAFF, sorted);
  };

  const handleSaveStaffToBackend = async (overrideStaff?: StaffMember[]): Promise<boolean> => {
    const sorted = sortStaffByHierarchy(overrideStaff || staffList);
    setStaffList(sorted);
    storageAdapter.write(STORAGE_KEYS.STAFF, sorted);
    try {
      await storeDataService.saveStaff(sorted);
      return true;
    } catch {
      return false; // DB write failed — caller surfaces the error
    }
  };

  // Fire-and-forget persistence of shared data to Supabase (errors are logged;
  // the authoritative sync happens through the admin panel save handlers).
  const persistShared = (promise: Promise<void>) => {
    promise.catch((err) => console.warn('[SharedData] background persist failed:', err?.message || err));
  };

  const handleUpdateServerUpdates = (newUpdates: ServerUpdate[]) => {
    setUpdatesList(newUpdates);
    storageAdapter.write(STORAGE_KEYS.UPDATES, newUpdates);
    persistShared(storeDataService.saveUpdates(newUpdates));
  };

  const handleUpdateSubAdminKeys = (newKeys: SubAdminKey[]) => {
    setSubAdminKeys(newKeys);
    storageAdapter.write(STORAGE_KEYS.SUBADMIN_KEYS, newKeys);
  };

  const handleUpdateCoupons = (newCoupons: Coupon[]) => {
    setCouponsList(newCoupons);
    storageAdapter.write(STORAGE_KEYS.COUPONS, newCoupons);
  };

  const handleUpdateCategories = (newCats: StoreCategory[]) => {
    const filteredCats = filterCleanCategories(newCats);
    setCategories(filteredCats);
    storageAdapter.write(STORAGE_KEYS.CATEGORIES, filteredCats);
    persistShared(storeDataService.saveCategories(filteredCats));
  };

  const handleUpdateLeaderboard = (newLead: TopBuyer[]) => {
    const sorted = [...newLead]
      .sort((a, b) => b.total_spent - a.total_spent)
      .map((item, idx) => ({
        ...item,
        rank: idx + 1,
      }));
    setLeaderboard(sorted);
    storageAdapter.write(STORAGE_KEYS.LEADERBOARD, sorted);
  };

  const handleSaveLeaderboardToBackend = async (overrideLead?: TopBuyer[]): Promise<boolean> => {
    const sorted = [...(overrideLead || leaderboard)]
      .sort((a, b) => b.total_spent - a.total_spent)
      .map((item, idx) => ({
        ...item,
        rank: idx + 1,
      }));
    setLeaderboard(sorted);
    storageAdapter.write(STORAGE_KEYS.LEADERBOARD, sorted);
    try {
      await storeDataService.saveLeaderboard(sorted);
      return true;
    } catch {
      return false; // DB write failed — caller surfaces the error
    }
  };

  const handleUpdateVoteLinks = (newLinks: VoteLink[]) => {
    setVoteLinks(newLinks);
    storageAdapter.write(STORAGE_KEYS.VOTE_LINKS, newLinks);
  };

  const handleUpdateConnectionGuide = (newGuide: ConnectionGuide) => {
    setConnectionGuide(newGuide);
    storageAdapter.write(STORAGE_KEYS.CONNECTION_GUIDE, newGuide);
  };

  const handleUpdateRulesCategories = (newCategories: RuleCategory[]) => {
    setRulesCategories(newCategories);
    storageAdapter.write(STORAGE_KEYS.RULES, newCategories);
  };

  const handleUpdateOrders = (_newOrders: Order[]) => {
    // Orders persist directly via OrderContext storageAdapter
  };

  const handleUpdateItems = (newItems: StoreItem[]) => {
    const filtered = filterCleanItems(newItems);
    setItems(filtered);
    storageAdapter.write(STORAGE_KEYS.ITEMS, filtered);
    persistShared(storeDataService.saveItems(filtered));
  };

  const handleUpdateCategoriesAndItems = (newCats: StoreCategory[], newItems: StoreItem[]) => {
    const filteredCats = filterCleanCategories(newCats);
    const filteredItems = filterCleanItems(newItems);
    setCategories(filteredCats);
    setItems(filteredItems);
    storageAdapter.write(STORAGE_KEYS.CATEGORIES, filteredCats);
    storageAdapter.write(STORAGE_KEYS.ITEMS, filteredItems);
    persistShared(storeDataService.saveCategories(filteredCats));
    persistShared(storeDataService.saveItems(filteredItems));
  };

  const [selectedGamemode, setSelectedGamemode] = useState<string | null>(null);

  return (
    <div
      data-store-theme={effectiveTheme}
      className="gaming-background min-h-screen text-foreground relative selection:bg-accent selection:text-accent-foreground font-sans"
    >
      {/* Ambient Theme Particles & Click Effects */}
      <GamingParticles />
      <WinterClickEffect />

      {/* Header */}
      <Header
        currentView={currentView}
        onSelectView={(view) => {
          setCurrentView(view);
          if (view === 'store') {
            setSelectedGamemode(null);
          }
        }}
        onOpenVote={() => setIsVoteOpen(true)}
        onOpenStaff={() => setCurrentView('staff')}
        onOpenSupport={() => {
          if (!user) {
            setPendingSupportOpen(true);
            setLoginMessage('Please sign in to open a support ticket and track its status.');
            setIsUserLoginOpen(true);
          } else {
            setIsSupportOpen(true);
          }
        }}
        onOpenAccount={() => {
          setAccountInitialTab('orders');
          setIsUserAccountOpen(true);
        }}
        onOpenWallet={() => {
          setAccountInitialTab('wallet');
          setIsUserAccountOpen(true);
        }}
        onOpenLogin={() => {
          setPendingSupportOpen(false);
          setLoginMessage('');
          setIsUserLoginOpen(true);
        }}
      />

      {/* Active Page View */}
      <div className="relative z-10">
        {currentView === 'donator' ? (
          <DonatorPage
            onBackToStore={() => {
              setCurrentView('store');
              setSelectedGamemode(null);
            }}
          />
        ) : currentView === 'staff' ? (
          <StaffPage
            staffList={staffList}
            onBackToStore={() => {
              setCurrentView('store');
              setSelectedGamemode(null);
            }}
          />
        ) : currentView === 'updates' ? (
          <UpdatesPage
            updates={updatesList}
            onBackToStore={() => {
              setCurrentView('store');
              setSelectedGamemode(null);
            }}
          />
        ) : currentView === 'join' ? (
          <HowToJoinPage
            connectionGuide={connectionGuide}
            onBackToStore={() => {
              setCurrentView('store');
              setSelectedGamemode(null);
            }}
          />
        ) : currentView === 'rules' ? (
          <RulesPage
            rulesCategories={rulesCategories}
            onBackToStore={() => {
              setCurrentView('store');
              setSelectedGamemode(null);
            }}
          />
        ) : (
          <StoreView
            categories={categories}
            items={items}
            leaderboard={leaderboard}
            couponsList={couponsList}
            isLoading={isLoading}
            selectedGamemode={selectedGamemode}
            onSelectGamemode={setSelectedGamemode}
            onOpenLogin={(msg) => {
              if (msg) setLoginMessage(msg);
              setIsUserLoginOpen(true);
            }}
          />
        )}
      </div>

      {/* Footer */}
      <Footer
        onOpenLegal={(type) => setLegalDoc(type)}
        onOpenAdmin={() => setIsAdminOpen(true)}
      />

      {/* Slide-out Cart Drawer */}
      <CartDrawer 
        onOpenLogin={(msg) => {
          if (msg) setLoginMessage(msg);
          setIsUserLoginOpen(true);
        }}
      />

      {/* UPI QR & Wallet Gateway Payment Modal */}
      <UpiPaymentModal
        onRequireLogin={(msg) => {
          if (msg) setLoginMessage(msg);
          setIsUpiModalOpen(false);
          setIsUserLoginOpen(true);
        }}
      />

      {/* Navigation Modals */}
      <VoteModal isOpen={isVoteOpen} onClose={() => setIsVoteOpen(false)} voteLinks={voteLinks} />
      <StaffModal
        isOpen={isStaffOpen}
        onClose={() => setIsStaffOpen(false)}
        staffList={staffList}
        onOpenFullPage={() => setCurrentView('staff')}
      />
      <SupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
        onRequireLogin={() => {
          setIsSupportOpen(false);
          setPendingSupportOpen(true);
          setLoginMessage('Please sign in to open a support ticket and track its status.');
          setIsUserLoginOpen(true);
        }}
      />
      <LegalModal type={legalDoc} onClose={() => setLegalDoc(null)} />
      <AdminLoginModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        staffList={staffList}
        onUpdateStaff={handleUpdateStaff}
        onSaveStaffToBackend={handleSaveStaffToBackend}
        leaderboard={leaderboard}
        onUpdateLeaderboard={handleUpdateLeaderboard}
        onSaveLeaderboardToBackend={handleSaveLeaderboardToBackend}
        items={items}
        onUpdateItems={handleUpdateItems}
        categories={categories}
        onUpdateCategories={handleUpdateCategories}
        onUpdateCategoriesAndItems={handleUpdateCategoriesAndItems}
        updatesList={updatesList}
        onUpdateServerUpdates={handleUpdateServerUpdates}
        subAdminKeys={subAdminKeys}
        onUpdateSubAdminKeys={handleUpdateSubAdminKeys}
        couponsList={couponsList}
        onUpdateCoupons={handleUpdateCoupons}
        activityLogs={activityLogs}
        onUpdateActivityLogs={handleUpdateActivityLogs}
        voteLinks={voteLinks}
        onUpdateVoteLinks={handleUpdateVoteLinks}
        onLogActivity={handleLogActivity}
        connectionGuide={connectionGuide}
        onUpdateConnectionGuide={handleUpdateConnectionGuide}
        rulesCategories={rulesCategories}
        onUpdateRulesCategories={handleUpdateRulesCategories}
        orders={orders}
        onUpdateOrders={handleUpdateOrders}
      />
      <PublicCouponsModal
        isOpen={isPublicCouponsOpen}
        onClose={() => setIsPublicCouponsOpen(false)}
        couponsList={couponsList}
      />
      <UserLoginModal 
        isOpen={isUserLoginOpen} 
        onClose={() => {
          setIsUserLoginOpen(false);
          setLoginMessage('');
          setPendingSupportOpen(false);
        }} 
        message={loginMessage}
        onSuccess={() => {
          if (pendingSupportOpen) {
            setPendingSupportOpen(false);
            setIsSupportOpen(true);
          }
        }}
      />
      <UserAccountModal
        isOpen={isUserAccountOpen}
        onClose={() => setIsUserAccountOpen(false)}
        orders={orders}
        initialTab={accountInitialTab}
        onOpenSupportCenter={() => setIsSupportOpen(true)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <StoreConfigProvider>
        <SaleProvider>
          <CartProvider>
            <AuthProvider>
              <TicketProvider>
                <WalletProvider>
                  <OrderProvider>
                    <MainStoreContent />
                  </OrderProvider>
                </WalletProvider>
              </TicketProvider>
            </AuthProvider>
          </CartProvider>
        </SaleProvider>
      </StoreConfigProvider>
    </ToastProvider>
  );
}

