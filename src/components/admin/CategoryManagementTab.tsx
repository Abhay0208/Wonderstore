import React, { useMemo, useState } from 'react';
import { CategoryThemeOption, StoreCategory, StoreItem } from '../../types';
import { useToast } from '../../context/ToastContext';
import { useStoreConfig } from '../../context/StoreConfigContext';
import { optimizeImage } from '../../utils/imageOptimizer';
import {
  isMatchingCategoryName,
  validateCategoryInput,
  saveCategoryAndSyncProducts,
  toggleCategoryEnabledState,
  deleteCategoryById,
} from '../../utils/categoryManagement';
import { getThemeMeta, resolveCategoryTheme } from '../../utils/categoryTheme';
import { GamemodeBackgroundCustomizer } from './GamemodeBackgroundCustomizer';
import {
  FolderPlus,
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Upload,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Search,
  Package,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

interface CategoryManagementTabProps {
  categories: StoreCategory[];
  items: StoreItem[];
  onUpdateCategories: (cats: StoreCategory[]) => void;
  onUpdateCategoriesAndItems?: (cats: StoreCategory[], items: StoreItem[]) => void;
  onUpdateItems: (items: StoreItem[]) => void;
  onLogActivity?: (action: string, details: string, type?: 'product' | 'settings' | 'other', adminName?: string) => void;
  adminName?: string;
}

const IMAGE_PRESETS = [
  { label: 'Ranks', url: '/store/ranks.png' },
  { label: 'Coins', url: '/store/coins.png' },
  { label: 'Keys', url: '/store/keys.png' },
  { label: 'Kits', url: '/store/kits.png' },
  { label: 'Others', url: '/store/others.png' },
];

const ICON_PRESETS = ['👑', '🪙', '🔑', '⚔️', '🎁', '💎', '❄️', '🎄', '🎆', '🛡️', '🔥', '⭐'];

export const CategoryManagementTab: React.FC<CategoryManagementTabProps> = ({
  categories,
  items,
  onUpdateCategories,
  onUpdateCategoriesAndItems,
  onUpdateItems,
  onLogActivity,
  adminName,
}) => {
  const { success, error } = useToast();
  const { effectiveTheme } = useStoreConfig();

  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'All' | 'Lifesteal' | 'Practice'>('All');

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [gameModeInput, setGameModeInput] = useState('Lifesteal');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [imageInput, setImageInput] = useState('/store/ranks.png');
  const [iconInput, setIconInput] = useState('👑');
  const [enabledInput, setEnabledInput] = useState(true);
  const [themeInput, setThemeInput] = useState<CategoryThemeOption>('auto');
  const [assignedItemIds, setAssignedItemIds] = useState<string[]>([]);
  const [productSearchInput, setProductSearchInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation dialog state
  const [pendingDeleteCat, setPendingDeleteCat] = useState<StoreCategory | null>(null);

  const filteredCategories = useMemo(() => {
    return categories
      .filter((cat) => {
        const matchesMode =
          modeFilter === 'All' || (cat.game_mode || '').toLowerCase() === modeFilter.toLowerCase();
        const matchesSearch =
          !searchQuery.trim() ||
          cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (cat.description || '').toLowerCase().includes(searchQuery.toLowerCase());
        return matchesMode && matchesSearch;
      })
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  }, [categories, modeFilter, searchQuery]);

  const openAddForm = () => {
    setEditingCatId(null);
    setNameInput('');
    setGameModeInput(modeFilter === 'Practice' ? 'Practice' : 'Lifesteal');
    setDescriptionInput('');
    setImageInput('/store/ranks.png');
    setIconInput('👑');
    setEnabledInput(true);
    setThemeInput('auto');
    setAssignedItemIds([]);
    setProductSearchInput('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (cat: StoreCategory) => {
    setEditingCatId(cat.id);
    setNameInput(cat.name);
    setGameModeInput(cat.game_mode || 'Lifesteal');
    setDescriptionInput(cat.description || '');
    setImageInput(cat.image_url || '/store/ranks.png');
    setIconInput(cat.icon || '📦');
    setEnabledInput(cat.enabled !== false);
    setThemeInput(cat.theme || 'auto');
    const currentlyLinkedIds = items
      .filter((it) => isMatchingCategoryName(it.category, cat.name))
      .map((it) => it.id);
    setAssignedItemIds(currentlyLinkedIds);
    setProductSearchInput('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const toggleProductAssignment = (itemId: string) => {
    setAssignedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateCategoryInput(
      {
        id: editingCatId,
        name: nameInput,
        game_mode: gameModeInput,
        description: descriptionInput,
        image_url: imageInput,
        icon: iconInput,
        enabled: enabledInput,
        theme: themeInput,
        assignedItemIds,
      },
      categories
    );

    if (!validation.valid) {
      setFormError(validation.error || 'Please check the category fields.');
      error(validation.error || 'Please check the category fields.');
      return;
    }

    const result = saveCategoryAndSyncProducts(
      {
        id: editingCatId,
        name: nameInput,
        game_mode: gameModeInput,
        description: descriptionInput,
        image_url: imageInput,
        icon: iconInput,
        enabled: enabledInput,
        theme: themeInput,
        assignedItemIds,
      },
      categories,
      items
    );

    if (onUpdateCategoriesAndItems) {
      onUpdateCategoriesAndItems(result.categories, result.items);
    } else {
      onUpdateCategories(result.categories);
      onUpdateItems(result.items);
    }

    const actionTitle = editingCatId ? 'Category Updated' : 'Category Created';
    onLogActivity?.(
      actionTitle,
      `${actionTitle}: "${result.savedCategory.name}" (${result.savedCategory.game_mode}, ${
        result.savedCategory.enabled !== false ? 'Enabled' : 'Disabled'
      }, ${assignedItemIds.length} products linked)`,
      'product',
      adminName
    );
    success(
      editingCatId
        ? `Saved changes to "${result.savedCategory.name}"!`
        : `Created new category "${result.savedCategory.name}"!`
    );

    setIsFormOpen(false);
    setEditingCatId(null);
    setFormError(null);
  };

  const handleToggleEnabled = (cat: StoreCategory) => {
    const { categories: nextCats, toggled } = toggleCategoryEnabledState(cat.id, categories);
    onUpdateCategories(nextCats);
    const nextStatus = toggled?.enabled !== false ? 'Enabled' : 'Disabled';
    onLogActivity?.(
      `Category ${nextStatus}`,
      `${nextStatus} category "${cat.name}" on store page`,
      'product',
      adminName
    );
    success(`Category "${cat.name}" is now ${nextStatus}.`);
  };

  const confirmDeleteCategory = () => {
    if (!pendingDeleteCat) return;
    if (categories.length <= 1) {
      error('At least one category must remain in the store.');
      setPendingDeleteCat(null);
      return;
    }
    const nextCats = deleteCategoryById(pendingDeleteCat.id, categories);
    onUpdateCategories(nextCats);
    onLogActivity?.(
      'Category Deleted',
      `Deleted category "${pendingDeleteCat.name}"`,
      'product',
      adminName
    );
    success(`Deleted category "${pendingDeleteCat.name}".`);
    setPendingDeleteCat(null);
  };

  const selectableProducts = useMemo(() => {
    if (!productSearchInput.trim()) return items;
    const q = productSearchInput.toLowerCase();
    return items.filter(
      (it) =>
        it.title.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q)
    );
  }, [items, productSearchInput]);

  const enabledCount = categories.filter((c) => c.enabled !== false).length;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border bg-surface-deep p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent border border-accent/30">
            <FolderPlus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-foreground font-display">
              Category Management
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {categories.length} total categories · {enabledCount} enabled on store page · Changes save locally in your browser
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openAddForm}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-black uppercase tracking-wider text-accent-foreground hover:opacity-90 transition-opacity cursor-pointer shadow-sm min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Category</span>
        </button>
      </div>

      {/* Gamemode Cards Background Images (Lifesteal & Practice) Customizer */}
      <GamemodeBackgroundCustomizer
        onLogActivity={onLogActivity}
        adminName={adminName}
      />

      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-deep p-1 overflow-x-auto">
          {(['All', 'Lifesteal', 'Practice'] as const).map((gm) => (
            <button
              key={gm}
              type="button"
              onClick={() => setModeFilter(gm)}
              className={`px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap min-h-[40px] ${
                modeFilter === gm
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {gm === 'All' ? `All Modes (${categories.length})` : gm}
            </button>
          ))}
        </div>

        <div className="relative sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories..."
            aria-label="Search categories"
            className="w-full rounded-xl border border-border bg-surface-deep pl-9 pr-3 py-2.5 text-xs text-foreground outline-none focus:border-accent min-h-[44px]"
          />
        </div>
      </div>

      {/* Add / Edit Category Form */}
      {isFormOpen && (
        <form
          onSubmit={handleSaveCategory}
          className="rounded-2xl border-2 border-accent/40 bg-surface-deep p-4 sm:p-6 space-y-5 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <h4 className="text-sm font-black uppercase tracking-wider text-foreground font-display">
                {editingCatId ? 'Edit Category' : 'Add New Category'}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setFormError(null);
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Cancel
            </button>
          </div>

          {formError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-bold text-red-300"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="cat-mgmt-name" className="block text-xs font-bold text-muted-foreground mb-1.5">
                Category Name *
              </label>
              <input
                id="cat-mgmt-name"
                type="text"
                required
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="e.g. Ranks, Coins, Crate Keys"
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-accent font-bold min-h-[44px]"
              />
            </div>

            <div>
              <label htmlFor="cat-mgmt-mode" className="block text-xs font-bold text-muted-foreground mb-1.5">
                Server Gamemode *
              </label>
              <select
                id="cat-mgmt-mode"
                value={gameModeInput}
                onChange={(e) => setGameModeInput(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-accent font-bold min-h-[44px]"
              >
                <option value="Lifesteal">Lifesteal</option>
                <option value="Practice">Practice</option>
              </select>
            </div>

            <div>
              <label htmlFor="cat-mgmt-theme" className="block text-xs font-bold text-muted-foreground mb-1.5">
                Category Tile Theme
              </label>
              <select
                id="cat-mgmt-theme"
                value={themeInput}
                onChange={(e) => setThemeInput(e.target.value as CategoryThemeOption)}
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-accent font-bold min-h-[44px]"
              >
                <option value="auto">Auto (Follow Active Website Theme)</option>
                <option value="winter">❄️ Winter Theme</option>
                <option value="christmas">🎄 Christmas Theme</option>
                <option value="newyear2027">🎆 New Year 2027 Theme</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="cat-mgmt-desc" className="block text-xs font-bold text-muted-foreground mb-1.5">
                Short Description
              </label>
              <input
                id="cat-mgmt-desc"
                type="text"
                value={descriptionInput}
                onChange={(e) => setDescriptionInput(e.target.value)}
                placeholder="e.g. Exclusive perks, commands, and abilities"
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-accent min-h-[44px]"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setEnabledInput((v) => !v)}
                aria-pressed={enabledInput}
                className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-black uppercase tracking-wider transition-colors cursor-pointer min-h-[44px] ${
                  enabledInput
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                }`}
              >
                <span className="flex items-center gap-2">
                  {enabledInput ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  <span>{enabledInput ? 'Enabled on Store' : 'Disabled (Hidden)'}</span>
                </span>
                <span className="text-[10px] opacity-80">Toggle</span>
              </button>
            </div>
          </div>

          {/* Icon & Image Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 rounded-xl border border-border bg-surface/60 p-4">
            <div className="lg:col-span-4 space-y-2.5">
              <label className="block text-xs font-bold text-foreground">
                Category Icon (Emoji / Symbol)
              </label>
              <div className="flex items-center gap-2">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-deep text-xl shrink-0">
                  {iconInput || '📦'}
                </span>
                <input
                  type="text"
                  value={iconInput}
                  onChange={(e) => setIconInput(e.target.value)}
                  maxLength={8}
                  aria-label="Category emoji icon"
                  className="w-full rounded-xl border border-border bg-surface-deep px-3 py-2 text-xs text-foreground outline-none focus:border-accent min-h-[44px]"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ICON_PRESETS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setIconInput(emoji)}
                    className={`h-8 w-8 rounded-lg border text-sm flex items-center justify-center cursor-pointer transition-colors ${
                      iconInput === emoji
                        ? 'border-accent bg-accent/20'
                        : 'border-border bg-surface-deep hover:border-border-strong'
                    }`}
                    aria-label={`Select icon ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-8 space-y-2.5">
              <label className="block text-xs font-bold text-foreground">
                Category Tile Image / PNG
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-deep mx-auto sm:mx-0">
                  <img
                    src={imageInput || '/store/ranks.png'}
                    alt="Category icon preview"
                    className="h-14 w-14 object-contain drop-shadow"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/store/ranks.png';
                    }}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="cursor-pointer rounded-xl border border-accent/40 bg-accent/15 hover:bg-accent/25 px-3.5 py-2 text-xs font-bold text-accent inline-flex items-center gap-2 min-h-[40px]">
                      <Upload className="w-4 h-4" />
                      <span>Upload Image</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const opt = await optimizeImage(file, 480, 480, 0.88);
                            if (opt) setImageInput(opt);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                    {IMAGE_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setImageInput(preset.url)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                          imageInput === preset.url
                            ? 'border-accent bg-accent text-accent-foreground'
                            : 'border-border bg-surface-deep text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={imageInput}
                    onChange={(e) => setImageInput(e.target.value)}
                    placeholder="Or paste image URL (e.g. /store/ranks.png)"
                    aria-label="Category image URL"
                    className="w-full rounded-xl border border-border bg-surface-deep px-3 py-2 text-xs font-mono text-foreground outline-none focus:border-accent"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Assign Products to Category */}
          <div className="rounded-xl border border-border bg-surface/60 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h5 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-accent" />
                  <span>Assign Products to This Category ({assignedItemIds.length} selected)</span>
                </h5>
                <p className="text-[11px] text-muted-foreground">
                  Selected products will automatically appear inside this category on the store page.
                </p>
              </div>
              <input
                type="text"
                value={productSearchInput}
                onChange={(e) => setProductSearchInput(e.target.value)}
                placeholder="Filter products..."
                className="rounded-lg border border-border bg-surface-deep px-3 py-1.5 text-xs text-foreground outline-none focus:border-accent sm:w-52"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
              {selectableProducts.map((item) => {
                const isSelected = assignedItemIds.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className={`flex items-center gap-2.5 rounded-xl border p-2.5 cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-accent bg-accent/15 text-foreground'
                        : 'border-border bg-surface-deep text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleProductAssignment(item.id)}
                      className="h-4 w-4 accent-sky-400 rounded shrink-0"
                    />
                    <img
                      src={item.image_url || '/store/ranks.png'}
                      alt=""
                      className="h-7 w-7 object-contain shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold block truncate">{item.title}</span>
                      <span className="text-[10px] text-muted-foreground block truncate">
                        Current: {item.category} · ₹{item.price}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setFormError(null);
              }}
              className="rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-xs font-black uppercase tracking-wider text-accent-foreground hover:opacity-90 cursor-pointer shadow-sm min-h-[44px]"
            >
              <Check className="w-4 h-4" />
              <span>{editingCatId ? 'Save Category Changes' : 'Create Category'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Categories List */}
      {filteredCategories.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface-deep p-10 text-center space-y-3">
          <ImageIcon className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-bold text-foreground">No matching categories found</p>
          <p className="text-xs text-muted-foreground">
            Adjust your filter or create a new store category above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCategories.map((cat) => {
            const isEnabled = cat.enabled !== false;
            const linkedProducts = items.filter((it) => isMatchingCategoryName(it.category, cat.name));
            const resolvedTheme = getThemeMeta(resolveCategoryTheme(cat.theme, effectiveTheme));

            return (
              <div
                key={cat.id}
                className={`rounded-2xl border p-4 flex flex-col justify-between gap-4 transition-all ${
                  isEnabled
                    ? 'border-border bg-surface-deep hover:border-accent/50'
                    : 'border-amber-500/30 bg-surface-deep/60 opacity-80'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative h-12 w-12 shrink-0 rounded-xl border border-border bg-surface flex items-center justify-center">
                        <img
                          src={cat.image_url || '/store/ranks.png'}
                          alt={cat.name}
                          className="h-9 w-9 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/store/ranks.png';
                          }}
                        />
                        {cat.icon && (
                          <span className="absolute -top-1.5 -right-1.5 text-sm leading-none">
                            {cat.icon}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-black text-foreground truncate font-display">
                          {cat.name}
                        </h4>
                        <p className="text-[11px] text-muted-foreground">
                          {cat.game_mode} · {linkedProducts.length} product{linkedProducts.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleEnabled(cat)}
                      aria-label={`${isEnabled ? 'Disable' : 'Enable'} category ${cat.name}`}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider cursor-pointer shrink-0 min-h-[34px] ${
                        isEnabled
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                          : 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                      }`}
                    >
                      {isEnabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      <span>{isEnabled ? 'Enabled' : 'Disabled'}</span>
                    </button>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
                    {cat.description || 'No description provided.'}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/60 pt-2.5">
                    <span>Tile style:</span>
                    <span className="font-bold text-foreground">
                      {cat.theme && cat.theme !== 'auto'
                        ? `${resolvedTheme.emoji} ${resolvedTheme.shortLabel}`
                        : `Auto (${resolvedTheme.shortLabel})`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => openEditForm(cat)}
                    aria-label={`Edit category ${cat.name}`}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-foreground hover:border-accent hover:text-accent transition-colors cursor-pointer min-h-[40px]"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit &amp; Assign</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteCat(cat)}
                    aria-label={`Delete category ${cat.name}`}
                    className="inline-flex items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500 hover:text-white transition-colors cursor-pointer min-h-[40px]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {pendingDeleteCat && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-category-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-surface p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15 text-red-400 border border-red-500/30">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 id="delete-category-title" className="text-sm font-black uppercase text-foreground font-display">
                    Delete Category &ldquo;{pendingDeleteCat.name}&rdquo;?
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This action removes the category tile from the store.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingDeleteCat(null)}
                className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Cancel deletion"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeleteCat(null)}
                className="rounded-xl border border-border bg-surface-deep px-4 py-2 text-xs font-bold text-foreground hover:border-border-strong cursor-pointer min-h-[42px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteCategory}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-red-500 cursor-pointer min-h-[42px]"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
