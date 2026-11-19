import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User as UserIcon,
  CheckCheck,
  X,
  Menu,
} from 'lucide-react';
import { useAuth, UserRole } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { LANGUAGE_OPTIONS, SupportedLanguage } from '../lib/i18n';
import { apiFetch } from '../lib/api';
import { FactoryPulseLogo } from './BrandLogo';
import { FactoryPulseAssistant } from './FactoryPulseAssistant';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group?: string;
  href?: string;
}

interface DashboardShellProps {
  roleTitle: string;
  accentHex: string; // Role identity accent (#FF8A32 Admin, #19C6B4 Manager, #A855F7 Worker, #10B981 Technician)
  navItems: NavItem[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  pageTitle: string;
  breadcrumbSub?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

interface NotificationRecord {
  id: string;
  category: string;
  title: string;
  message: string;
  related_link: string | null;
  is_read: number;
  created_at: string;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  roleTitle,
  accentHex,
  navItems,
  activeTab,
  onSelectTab,
  pageTitle,
  breadcrumbSub,
  headerActions,
  children,
}) => {
  const { user, logout, refreshProfile } = useAuth();
  const { notify } = useToast();
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Profile modal form
  const [profName, setProfName] = useState(user?.fullName || '');
  const [profPhone, setProfPhone] = useState(user?.phone || '');
  const [profPass, setProfPass] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await apiFetch<{ notifications: NotificationRecord[]; unreadCount: number }>('/api/notifications');
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Quietly ignore if unmounted
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 12000);
    return () => clearInterval(timer);
  }, [loadNotifications]);

  useEffect(() => {
    if (user) {
      setProfName(user.fullName);
      setProfPhone(user.phone || '');
    }
  }, [user]);

  const handleMarkRead = async (id: string, link?: string | null) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      await loadNotifications();
      if (link) {
        setNotifOpen(false);
        navigate(link);
      }
    } catch (err: any) {
      notify('error', 'Failed to update notification', err.message);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/api/notifications/all/read', { method: 'PATCH' });
      await loadNotifications();
      notify('success', 'Notifications cleared', 'All alerts marked as read.');
    } catch (err: any) {
      notify('error', 'Error', err.message);
    }
  };

  const handleLogout = async () => {
    await logout();
    notify('info', 'Signed out', 'Your FactoryPulse IntelliOps session has ended.');
    navigate('/login');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: profName,
          phone: profPhone,
          newPassword: profPass || undefined,
        }),
      });
      await refreshProfile();
      setProfPass('');
      setProfileOpen(false);
      notify('success', 'Account settings updated');
    } catch (err: any) {
      notify('error', 'Update failed', err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const accentTextClass: Record<UserRole, string> = {
    ADMIN: 'text-[#FF8A32]',
    MANAGER: 'text-[#19C6B4]',
    WORKER: 'text-[#C084FC]',
    TECHNICIAN: 'text-[#10B981]',
  };

  const accentActiveBg: Record<UserRole, string> = {
    ADMIN: 'bg-[#FF8A32]/15 text-[#FF8A32] border border-[#FF8A32]/30',
    MANAGER: 'bg-[#19C6B4]/15 text-[#19C6B4] border border-[#19C6B4]/30',
    WORKER: 'bg-[#C084FC]/15 text-[#E879F9] border border-[#C084FC]/30',
    TECHNICIAN: 'bg-[#10B981]/15 text-[#34D399] border border-[#10B981]/30',
  };

  const currentRole = user?.role || 'MANAGER';

  const groups = Array.from(new Set(navItems.map((i) => i.group || 'Operations')));

  const renderSidebarNav = () => (
    <div className="flex flex-col h-full">
      <div className="h-16 px-4 flex items-center justify-between border-b border-neutral-800 shrink-0">
        {!collapsed ? (
          <button onClick={() => navigate('/')} className="text-left focus:outline-none">
            <FactoryPulseLogo size="sm" />
          </button>
        ) : (
          <button onClick={() => navigate('/')} className="mx-auto focus:outline-none" title="FactoryPulse IntelliOps">
            <FactoryPulseLogo size="sm" showWordmark={false} />
          </button>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden lg:flex p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {groups.map((grp) => (
          <div key={grp}>
            {!collapsed && (
              <p className="px-2.5 mb-2 text-xs font-medium text-neutral-500">
                {grp}
              </p>
            )}
            <div className="space-y-1">
              {navItems
                .filter((item) => (item.group || 'Operations') === grp)
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        if (item.href) {
                          navigate(item.href);
                        } else {
                          onSelectTab(item.id);
                        }
                      }}
                      title={collapsed ? item.label : undefined}
                      className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                        isActive
                          ? accentActiveBg[currentRole]
                          : 'text-neutral-300 hover:text-white hover:bg-[#242A33] border border-transparent'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {/* Sidebar Profile & Logout Footer */}
      <div className="p-3 border-t border-neutral-800 space-y-2 shrink-0">
        {!collapsed && user && (
          <button
            onClick={() => setProfileOpen(true)}
            className="w-full text-left px-2.5 py-2 rounded-md hover:bg-[#242A33] transition-colors"
          >
            <p className="text-xs font-semibold text-[#F5F6F8] truncate">{user.fullName}</p>
            <p className="text-xs text-neutral-400 truncate mt-0.5">
              <span className={accentTextClass[currentRole]}>{roleTitle}</span> · {user.employeeCode}
            </p>
          </button>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium text-neutral-400 hover:text-[#EF4444] hover:bg-[#242A33] transition-colors whitespace-nowrap"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  // Sync accentHex onto data attribute for clean styling without inline style tags
  void accentHex;

  return (
    <div className="min-h-screen bg-[#171A21] text-[#F5F6F8] flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block bg-[#14171D] border-r border-neutral-800 shrink-0 transition-all duration-150 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className="sticky top-0 h-screen">{renderSidebarNav()}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-64 bg-[#14171D] border-r border-neutral-800 h-full">{renderSidebarNav()}</div>
          <div className="flex-1 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb trail on left, contextual actions on right */}
        <header className="h-16 bg-[#171A21]/95 backdrop-blur border-b border-neutral-800 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-md text-neutral-300 hover:bg-[#242A33]"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-neutral-400 hidden sm:inline whitespace-nowrap">{roleTitle}</span>
              <span className="text-neutral-600 hidden sm:inline">/</span>
              <span className="font-semibold text-[#F5F6F8] truncate">{pageTitle}</span>
              {breadcrumbSub && (
                <>
                  <span className="text-neutral-600 hidden md:inline">·</span>
                  <span className="text-xs text-neutral-400 hidden md:inline truncate">{breadcrumbSub}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {headerActions}

            {/* Language Selector */}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
              className="bg-[#242A33] border border-neutral-700/80 rounded-md px-2.5 py-1 text-xs text-neutral-200 font-medium focus:outline-none focus:border-[#21C7B7]"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.nativeName} ({opt.code.toUpperCase()})
                </option>
              ))}
            </select>

            <button
              onClick={() => setNotifOpen((o) => !o)}
              className="relative p-2 rounded-md bg-[#242A33] border border-neutral-700/80 text-neutral-200 hover:text-white transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-[#FF8A32] text-[#171A21] text-[10px] font-bold font-mono tabular-nums rounded">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setProfileOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#242A33] border border-neutral-700/80 text-xs font-medium text-neutral-200 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{user?.employeeCode}</span>
            </button>
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">{children}</main>

        {/* Conversational & Voice Assistant Widget */}
        <FactoryPulseAssistant />
      </div>

      {/* Notification Slide-over Panel */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
          <div className="bg-[#1C2129] border-l border-neutral-800 w-full max-w-md h-full flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#F5F6F8]">Operational Notifications</h3>
                <p className="text-xs text-neutral-400 mt-0.5 tabular-nums">
                  {unreadCount} unread · Connected plant events
                </p>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#19C6B4] hover:bg-[#242A33] rounded-md whitespace-nowrap"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setNotifOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-md"
                  aria-label="Close notifications"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-neutral-800/80">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-neutral-400">
                  No notifications recorded for your account yet.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 transition-colors ${n.is_read ? 'bg-transparent opacity-75' : 'bg-[#242A33]/70'}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
                      <span className="font-medium text-[#FF8A32]">{n.category}</span>
                      <span className="font-mono tabular-nums">
                        {new Date(n.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-[#F5F6F8] mt-1">{n.title}</p>
                    <p className="text-xs text-neutral-300 mt-1 leading-relaxed">{n.message}</p>
                    <div className="flex items-center gap-3 mt-2.5">
                      {!n.is_read && (
                        <button
                          onClick={() => handleMarkRead(n.id)}
                          className="text-xs font-medium text-[#19C6B4] hover:underline"
                        >
                          Mark as read
                        </button>
                      )}
                      {n.related_link && (
                        <button
                          onClick={() => handleMarkRead(n.id, n.related_link)}
                          className="text-xs font-medium text-neutral-300 hover:text-white underline"
                        >
                          Open related record
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Profile & Account Settings Modal */}
      {profileOpen && user && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#242A33] border border-neutral-700 rounded-lg max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-700/80">
              <div>
                <h3 className="text-lg font-semibold text-[#F5F6F8]">Account & Profile Settings</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {user.email} · {user.role} · {user.employeeCode}
                </p>
              </div>
              <button onClick={() => setProfileOpen(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={profName}
                  onChange={(e) => setProfName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white focus:outline-none focus:border-[#FF8A32]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={profPhone}
                  onChange={(e) => setProfPhone(e.target.value)}
                  placeholder="+91 98200 00000"
                  className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white focus:outline-none focus:border-[#FF8A32]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Update Password <span className="text-neutral-500">(optional, min 8 chars)</span>
                </label>
                <input
                  type="password"
                  minLength={8}
                  value={profPass}
                  onChange={(e) => setProfPass(e.target.value)}
                  placeholder="Leave blank to keep current password"
                  className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white focus:outline-none focus:border-[#FF8A32]"
                />
              </div>
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-neutral-300 bg-[#171A21] border border-neutral-700 rounded-md hover:bg-neutral-800 whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-4 py-2 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f] whitespace-nowrap"
                >
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
