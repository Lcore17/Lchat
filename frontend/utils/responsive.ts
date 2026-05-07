import { Dimensions, PixelRatio, Platform } from 'react-native';

const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

const getScales = () => {
  if (Platform.OS === 'web') {
    return {
      widthScale: 1,
      heightScale: 1,
      width: Dimensions.get('window').width,
    };
  }

  const { width, height } = Dimensions.get('window');
  return {
    widthScale: width / BASE_WIDTH,
    heightScale: height / BASE_HEIGHT,
    width,
  };
};

export const rs = (size: number) => {
  const { widthScale } = getScales();
  return Math.round(PixelRatio.roundToNearestPixel(size * widthScale));
};

export const rvs = (size: number) => {
  const { heightScale } = getScales();
  return Math.round(PixelRatio.roundToNearestPixel(size * heightScale));
};

export const rms = (size: number, factor = 0.5) => {
  const scaled = rs(size);
  return Math.round(size + (scaled - size) * factor);
};

export const isSmallDevice = () => {
  const { width } = getScales();
  return width <= 360;
};

export const maxContentWidth = (defaultWidth = 640) => {
  const { width } = getScales();
  return Math.min(defaultWidth, Math.round(width * 0.94));
};
