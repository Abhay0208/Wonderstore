import React, { createContext, useContext, useState } from 'react';
import { StoreSaleConfig, StoreItem } from '../types';
import { STORE_CONFIG } from '../config/storeDefaults';
import { storageAdapter, STORAGE_KEYS } from '../services/storageAdapter';

interface SaleContextType {
  saleConfig: StoreSaleConfig;
  updateSaleConfig: (config: StoreSaleConfig) => void;
  getItemPricing: (item: StoreItem) => {
    originalPrice: number;
    discountedPrice: number;
    hasDiscount: boolean;
    discountPercent: number;
    isCustomDiscount: boolean;
  };
}

const SaleContext = createContext<SaleContextType | undefined>(undefined);

export const SaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [saleConfig, setSaleConfig] = useState<StoreSaleConfig>(() =>
    storageAdapter.read<StoreSaleConfig>(STORAGE_KEYS.SALE_CONFIG, STORE_CONFIG.sale)
  );

  const updateSaleConfig = (newConfig: StoreSaleConfig) => {
    setSaleConfig(newConfig);
    storageAdapter.write(STORAGE_KEYS.SALE_CONFIG, newConfig);
  };

  const getItemPricing = (item: StoreItem) => {
    const originalPrice = item.price;

    if (typeof item.discount_percent === 'number' && item.discount_percent > 0) {
      const pct = Math.min(100, Math.max(0, item.discount_percent));
      const discountedPrice = Math.round(originalPrice * (1 - pct / 100));
      return {
        originalPrice,
        discountedPrice,
        hasDiscount: true,
        discountPercent: pct,
        isCustomDiscount: true,
      };
    }

    if (saleConfig.enabled && saleConfig.percent > 0) {
      const pct = Math.min(100, Math.max(0, saleConfig.percent));
      const discountedPrice = Math.round(originalPrice * (1 - pct / 100));
      return {
        originalPrice,
        discountedPrice,
        hasDiscount: true,
        discountPercent: pct,
        isCustomDiscount: false,
      };
    }

    return {
      originalPrice,
      discountedPrice: originalPrice,
      hasDiscount: false,
      discountPercent: 0,
      isCustomDiscount: false,
    };
  };

  return (
    <SaleContext.Provider
      value={{
        saleConfig,
        updateSaleConfig,
        getItemPricing,
      }}
    >
      {children}
    </SaleContext.Provider>
  );
};

export const useSale = () => {
  const context = useContext(SaleContext);
  if (!context) {
    throw new Error('useSale must be used within a SaleProvider');
  }
  return context;
};
