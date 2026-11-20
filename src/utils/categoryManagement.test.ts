import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCategoryInput,
  saveCategoryAndSyncProducts,
  toggleCategoryEnabledState,
  deleteCategoryById,
  getVisibleStoreCategories,
  getGamemodeSummaries,
} from './categoryManagement';
import { StoreCategory, StoreItem } from '../types';

const sampleCategories: StoreCategory[] = [
  {
    id: 'cat-1',
    name: 'Ranks',
    game_mode: 'Lifesteal',
    description: 'Server ranks',
    image_url: '/store/ranks.png',
    icon: '👑',
    enabled: true,
    display_order: 0,
  },
  {
    id: 'cat-2',
    name: 'Coins',
    game_mode: 'Lifesteal',
    description: 'Store coins',
    image_url: '/store/coins.png',
    icon: '🪙',
    enabled: false,
    display_order: 1,
  },
];

const sampleItems: StoreItem[] = [
  {
    id: 'item-1',
    title: 'Titan Rank',
    category: 'Ranks',
    price: 200,
    description: 'Top rank',
    image_url: '/store/ranks.png',
  },
  {
    id: 'item-2',
    title: '5000 Coins',
    category: 'Coins',
    price: 150,
    description: 'Coin bundle',
    image_url: '/store/coins.png',
  },
];

describe('categoryManagement helpers', () => {
  it('validates empty and duplicate category names', () => {
    const emptyRes = validateCategoryInput(
      { name: '   ', game_mode: 'Lifesteal', description: '', image_url: '' },
      sampleCategories
    );
    assert.equal(emptyRes.valid, false);

    const dupRes = validateCategoryInput(
      { name: 'ranks', game_mode: 'Lifesteal', description: '', image_url: '' },
      sampleCategories
    );
    assert.equal(dupRes.valid, false);

    const okDifferentMode = validateCategoryInput(
      { name: 'Ranks', game_mode: 'Practice', description: '', image_url: '' },
      sampleCategories
    );
    assert.equal(okDifferentMode.valid, true);
  });

  it('adds a category, assigns products, and renames linked items on edit', () => {
    const added = saveCategoryAndSyncProducts(
      {
        name: 'VIP Bundles',
        game_mode: 'Lifesteal',
        description: 'Special bundles',
        image_url: '/store/others.png',
        icon: '🎁',
        enabled: true,
        assignedItemIds: ['item-2'],
      },
      sampleCategories,
      sampleItems,
      12345
    );

    assert.equal(added.categories.length, 3);
    assert.equal(added.savedCategory.id, 'cat-12345');
    assert.equal(added.savedCategory.icon, '🎁');
    assert.equal(added.items.find((i) => i.id === 'item-2')?.category, 'VIP Bundles');

    const edited = saveCategoryAndSyncProducts(
      {
        id: 'cat-12345',
        name: 'Super Bundles',
        game_mode: 'Lifesteal',
        description: 'Updated',
        image_url: '/store/others.png',
        icon: '⚡',
        enabled: true,
      },
      added.categories,
      added.items
    );

    assert.equal(edited.items.find((i) => i.id === 'item-2')?.category, 'Super Bundles');
    assert.equal(edited.categories.find((c) => c.id === 'cat-12345')?.name, 'Super Bundles');
  });

  it('toggles category enabled status and filters store visibility', () => {
    const visibleBefore = getVisibleStoreCategories(sampleCategories, 'Lifesteal');
    assert.deepEqual(visibleBefore.map((c) => c.id), ['cat-1']);

    const { categories: afterEnable, toggled } = toggleCategoryEnabledState('cat-2', sampleCategories);
    assert.equal(toggled?.enabled, true);

    const visibleAfter = getVisibleStoreCategories(afterEnable, 'Lifesteal');
    assert.deepEqual(visibleAfter.map((c) => c.id), ['cat-1', 'cat-2']);
  });

  it('deletes category cleanly by ID', () => {
    const remaining = deleteCategoryById('cat-2', sampleCategories);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, 'cat-1');
  });

  it('computes distinct gamemode summaries with visible category and package counts', () => {
    const catsWithPractice: StoreCategory[] = [
      ...sampleCategories,
      {
        id: 'cat-3',
        name: 'Practice Ranks',
        game_mode: 'Practice',
        description: 'PvP ranks',
        image_url: '/store/ranks.png',
        enabled: true,
        display_order: 2,
      },
    ];
    const itemsWithPractice: StoreItem[] = [
      ...sampleItems,
      {
        id: 'item-3',
        title: 'Champion Rank',
        category: 'Practice Ranks',
        price: 300,
        description: 'Practice rank',
        image_url: '/store/ranks.png',
      },
    ];

    const summaries = getGamemodeSummaries(catsWithPractice, itemsWithPractice);
    assert.equal(summaries.length, 2);
    assert.equal(summaries[0].id, 'Lifesteal');
    assert.equal(summaries[0].accent, 'crimson');
    assert.equal(summaries[0].categoryCount, 1);
    assert.equal(summaries[0].packageCount, 1);

    assert.equal(summaries[1].id, 'Practice');
    assert.equal(summaries[1].accent, 'cobalt');
    assert.equal(summaries[1].categoryCount, 1);
    assert.equal(summaries[1].packageCount, 1);
  });
});
