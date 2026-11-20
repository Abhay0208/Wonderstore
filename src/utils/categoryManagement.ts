import { CategoryThemeOption, StoreCategory, StoreItem } from '../types';

export interface CategoryFormInput {
  id?: string | null;
  name: string;
  game_mode: string;
  description: string;
  image_url: string;
  icon?: string;
  enabled?: boolean;
  theme?: CategoryThemeOption;
  assignedItemIds?: string[];
}

export interface CategoryValidationResult {
  valid: boolean;
  error?: string;
}

export const isMatchingCategoryName = (a: string | undefined, b: string | undefined): boolean => {
  const normA = (a || '').trim().toLowerCase();
  const normB = (b || '').trim().toLowerCase();
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if ((normA === 'crate keys' || normA === 'keys') && (normB === 'crate keys' || normB === 'keys')) {
    return true;
  }
  return false;
};

export function validateCategoryInput(
  input: CategoryFormInput,
  existingCategories: StoreCategory[]
): CategoryValidationResult {
  const cleanName = (input.name || '').trim();
  if (!cleanName) {
    return { valid: false, error: 'Category name is required.' };
  }
  if (cleanName.length < 2) {
    return { valid: false, error: 'Category name must be at least 2 characters.' };
  }
  if (cleanName.length > 40) {
    return { valid: false, error: 'Category name must be 40 characters or less.' };
  }

  const cleanMode = (input.game_mode || '').trim();
  if (!cleanMode) {
    return { valid: false, error: 'Please select a server game mode.' };
  }

  const duplicate = existingCategories.find(
    (c) =>
      c.id !== input.id &&
      c.name.trim().toLowerCase() === cleanName.toLowerCase() &&
      (c.game_mode || '').trim().toLowerCase() === cleanMode.toLowerCase()
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Category "${cleanName}" already exists in ${cleanMode}.`,
    };
  }

  return { valid: true };
}

export function saveCategoryAndSyncProducts(
  input: CategoryFormInput,
  categories: StoreCategory[],
  items: StoreItem[],
  nowMs = Date.now()
): { categories: StoreCategory[]; items: StoreItem[]; savedCategory: StoreCategory } {
  const trimmedName = input.name.trim();
  const cleanImage = (input.image_url || '').trim() || '/store/ranks.png';
  const cleanIcon = (input.icon || '').trim() || '📦';
  const isEnabled = input.enabled !== false;
  const theme: CategoryThemeOption = input.theme || 'auto';

  let updatedCategories: StoreCategory[];
  let savedCategory: StoreCategory;
  let oldName = '';

  if (input.id) {
    const existing = categories.find((c) => c.id === input.id);
    oldName = existing ? existing.name : '';
    savedCategory = {
      ...(existing || {
        id: input.id,
        display_order: categories.length,
      }),
      name: trimmedName,
      game_mode: input.game_mode,
      description: (input.description || '').trim(),
      image_url: cleanImage,
      icon: cleanIcon,
      enabled: isEnabled,
      theme,
    };
    updatedCategories = categories.map((c) => (c.id === input.id ? savedCategory : c));
  } else {
    savedCategory = {
      id: `cat-${nowMs}`,
      name: trimmedName,
      game_mode: input.game_mode,
      description: (input.description || '').trim(),
      image_url: cleanImage,
      icon: cleanIcon,
      enabled: isEnabled,
      display_order: categories.length,
      theme,
    };
    updatedCategories = [...categories, savedCategory];
  }

  let updatedItems = [...items];

  // Rename category reference on existing items when category name changed
  if (oldName && oldName.trim().toLowerCase() !== trimmedName.toLowerCase()) {
    updatedItems = updatedItems.map((it) =>
      isMatchingCategoryName(it.category, oldName)
        ? { ...it, category: trimmedName }
        : it
    );
  }

  // Explicitly assign selected products to this category if provided
  if (Array.isArray(input.assignedItemIds)) {
    const assignedSet = new Set(input.assignedItemIds);
    updatedItems = updatedItems.map((it) => {
      if (assignedSet.has(it.id)) {
        return { ...it, category: trimmedName };
      }
      return it;
    });
  }

  return {
    categories: updatedCategories,
    items: updatedItems,
    savedCategory,
  };
}

export function toggleCategoryEnabledState(
  categoryId: string,
  categories: StoreCategory[]
): { categories: StoreCategory[]; toggled?: StoreCategory } {
  let toggled: StoreCategory | undefined;
  const next = categories.map((c) => {
    if (c.id !== categoryId) return c;
    toggled = { ...c, enabled: c.enabled === false ? true : false };
    return toggled;
  });
  return { categories: next, toggled };
}

export function deleteCategoryById(
  categoryId: string,
  categories: StoreCategory[]
): StoreCategory[] {
  return categories.filter((c) => c.id !== categoryId);
}

export function getVisibleStoreCategories(
  categories: StoreCategory[],
  selectedGamemode: string | null
): StoreCategory[] {
  return categories
    .filter(
      (c) =>
        c.enabled !== false &&
        c.game_mode?.toLowerCase() !== 'survival' &&
        !c.name?.toLowerCase().includes('survival') &&
        c.name?.toLowerCase() !== 'merch' &&
        (!selectedGamemode ||
          (c.game_mode && c.game_mode.toLowerCase() === selectedGamemode.toLowerCase()))
    )
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

export interface GamemodeSummary {
  id: string;
  label: string;
  subtitle: string;
  description: string;
  accent: 'crimson' | 'cobalt' | 'emerald';
  categoryCount: number;
  packageCount: number;
}

const KNOWN_GAMEMODE_META: Record<
  string,
  Pick<GamemodeSummary, 'label' | 'subtitle' | 'description' | 'accent'>
> = {
  lifesteal: {
    label: 'Lifesteal',
    subtitle: 'Lifesteal SMP',
    description: 'Ranks, crates, kits & coins',
    accent: 'crimson',
  },
  practice: {
    label: 'Practice',
    subtitle: 'Practice PvP',
    description: 'PvP perks, tags & bundles',
    accent: 'cobalt',
  },
};

export function getGamemodeSummaries(
  categories: StoreCategory[],
  items: StoreItem[]
): GamemodeSummary[] {
  const visibleAll = getVisibleStoreCategories(categories, null);
  const discoveredOrder: string[] = ['Lifesteal', 'Practice'];

  for (const cat of visibleAll) {
    const mode = (cat.game_mode || '').trim();
    if (
      mode &&
      !discoveredOrder.some((existing) => existing.toLowerCase() === mode.toLowerCase())
    ) {
      discoveredOrder.push(mode);
    }
  }

  return discoveredOrder.map((modeId) => {
    const modeKey = modeId.toLowerCase();
    const meta = KNOWN_GAMEMODE_META[modeKey] || {
      label: modeId,
      subtitle: `${modeId} Realm`,
      description: 'Ranks, bundles & seasonal items',
      accent: 'emerald' as const,
    };
    const modeCategories = visibleAll.filter(
      (c) => (c.game_mode || '').trim().toLowerCase() === modeKey
    );
    const modeItems = items.filter((item) => {
      const lowerCat = (item.category || '').toLowerCase();
      if (lowerCat.includes('survival') || lowerCat === 'merch' || item.category === 'Claim Blocks') {
        return false;
      }
      return modeCategories.some((c) => isMatchingCategoryName(c.name, item.category));
    });

    return {
      id: modeId,
      label: meta.label,
      subtitle: meta.subtitle,
      description: meta.description,
      accent: meta.accent,
      categoryCount: modeCategories.length,
      packageCount: modeItems.length,
    };
  });
}

export function deduplicateStoreCategories(list: StoreCategory[]): StoreCategory[] {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const result: StoreCategory[] = [];
  for (const cat of list) {
    if (!cat || !cat.name) continue;
    const id = (cat.id || '').trim();
    const key = `${cat.name.trim().toLowerCase()}::${(cat.game_mode || '').trim().toLowerCase()}`;
    if ((id && seenIds.has(id)) || seenKeys.has(key)) continue;
    if (id) seenIds.add(id);
    seenKeys.add(key);
    result.push(cat);
  }
  return result;
}


