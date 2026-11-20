import defaultPreview from '../assets/images/theme_preview_default_1794741339580.jpg';
import winterPreview from '../assets/images/theme_preview_winter_1794541294807.jpg';
import christmasPreview from '../assets/images/theme_preview_christmas_1794541296524.jpg';
import newYear2027Preview from '../assets/images/theme_preview_newyear_2027_1794541296316.jpg';
import ramadanPreview from '../assets/images/theme_preview_ramadan_1794741317519.jpg';
import { StoreThemeId } from '../types';

export const THEME_PREVIEW_IMAGES: Record<StoreThemeId, string> = {
  default: defaultPreview,
  winter: winterPreview,
  christmas: christmasPreview,
  newyear2027: newYear2027Preview,
  ramadan: ramadanPreview,
};
