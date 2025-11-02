/**
 * Enhanced Component Type Definitions for React Native 0.82.1
 *
 * Comprehensive type definitions for common React Native components
 * - Base component props
 * - Layout and styling props
 * - Event handling props
 * - Accessibility props
 * - Animation props
 *
 * @version 1.0.0
 */

import { ReactNode, ComponentProps } from 'react';
import {
  ViewProps as RNViewProps,
  TextProps as RNTextProps,
  TouchableOpacityProps,
  ScrollViewProps,
  FlatListProps,
  ImageProps,
  TextInputProps,
} from 'react-native';

// Base component props that all components can extend
export interface BaseComponentProps {
  children?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link' | 'image' | 'text' | 'none';
}

// Enhanced View Props
export interface EnhancedViewProps extends RNViewProps, BaseComponentProps {
  animated?: boolean;
  loading?: boolean;
  error?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'small' | 'medium' | 'large';
}

// Enhanced Text Props
export interface EnhancedTextProps extends RNTextProps, BaseComponentProps {
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body' | 'caption' | 'label';
  weight?: 'light' | 'normal' | 'medium' | 'semibold' | 'bold';
  align?: 'left' | 'center' | 'right' | 'justify';
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  selectable?: boolean;
  numberOfLines?: number;
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip';
}

// Enhanced Touchable Props
export interface EnhancedTouchableProps extends TouchableOpacityProps, BaseComponentProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'link';
  size?: 'small' | 'medium' | 'large' | 'icon';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  rounded?: boolean;
  pressed?: boolean;
}

// Enhanced ScrollView Props
export interface EnhancedScrollViewProps extends ScrollViewProps, BaseComponentProps {
  direction?: 'vertical' | 'horizontal';
  paging?: boolean;
  showsIndicators?: boolean;
  bounces?: boolean;
  scrollEnabled?: boolean;
  onScrollBegin?: () => void;
  onScrollEnd?: () => void;
  onMomentumScrollBegin?: () => void;
  onMomentumScrollEnd?: () => void;
}

// Enhanced FlatList Props
export interface EnhancedFlatListProps<T = any>
  extends FlatListProps<T>, BaseComponentProps {
  data: T[];
  renderItem: ({ item, index }: { item: T; index: number }) => ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  emptyComponent?: ReactNode;
  errorComponent?: ReactNode;
  ListHeaderComponent?: ReactNode;
  ListFooterComponent?: ReactNode;
  ItemSeparatorComponent?: ReactNode;
  showsVerticalScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
}

// Enhanced Image Props
export interface EnhancedImageProps extends ImageProps, BaseComponentProps {
  source: ImageProps['source'];
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  blurRadius?: number;
  loading?: boolean;
  error?: boolean;
  fallbackSource?: ImageProps['source'];
  progressiveRendering?: boolean;
  fadeDuration?: number;
}

// Enhanced TextInput Props
export interface EnhancedTextInputProps extends TextInputProps, BaseComponentProps {
  variant?: 'default' | 'outlined' | 'filled' | 'underline';
  size?: 'small' | 'medium' | 'large';
  error?: boolean;
  success?: boolean;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  helperText?: string;
  errorText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  showClearButton?: boolean;
  showPasswordToggle?: boolean;
  mask?: 'phone' | 'credit-card' | 'ssn' | 'zip-code';
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  spellCheck?: boolean;
  autoComplete?: 'off' | 'username' | 'password' | 'email' | 'name' | 'tel' | 'street-address' | 'postal-code' | 'cc-number' | 'cc-exp' | 'cc-csc';
}

// Button component props
export interface ButtonProps extends EnhancedTouchableProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loadingText?: string;
}

// Card component props
export interface CardProps extends EnhancedViewProps {
  title?: string;
  subtitle?: string;
  header?: ReactNode;
  footer?: ReactNode;
  actions?: ReactNode;
  elevation?: number;
  outlined?: boolean;
  rounded?: boolean;
}

// Modal component props
export interface ModalProps extends BaseComponentProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  animationType?: 'none' | 'slide' | 'fade';
  presentationStyle?: 'fullScreen' | 'pageSheet' | 'formSheet' | 'overFullScreen';
  transparent?: boolean;
  hardwareAccelerated?: boolean;
}

// Loading component props
export interface LoadingProps extends BaseComponentProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
  text?: string;
  overlay?: boolean;
  fullScreen?: boolean;
}

// Error boundary props
export interface ErrorBoundaryProps extends BaseComponentProps {
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: any) => void;
  resetOnPropsChange?: boolean;
  resetKeys?: Array<string | number>;
}

// Toast component props
export interface ToastProps extends BaseComponentProps {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  position?: 'top' | 'bottom' | 'center';
  action?: {
    label: string;
    onPress: () => void;
  };
}

// Form field props
export interface FormFieldProps extends BaseComponentProps {
  name: string;
  label?: string;
  placeholder?: string;
  helperText?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  value?: any;
  onChange?: (value: any) => void;
  onBlur?: () => void;
  onFocus?: () => void;
}

// Navigation types
export interface NavigationTab {
  name: string;
  label: string;
  icon?: string;
  badge?: string | number;
  accessibilityLabel?: string;
}

export interface NavigationProps {
  tabs: NavigationTab[];
  activeTab: string;
  onTabPress: (tabName: string) => void;
  variant?: 'default' | 'minimal' | 'filled';
  position?: 'top' | 'bottom';
}

// Chart component props
export interface ChartProps extends BaseComponentProps {
  data: ChartDataset[];
  width?: number;
  height?: number;
  type?: 'line' | 'bar' | 'pie' | 'doughnut' | 'area';
  animated?: boolean;
  showGrid?: boolean;
  showLegend?: boolean;
  colors?: string[];
  onPointPress?: (dataPoint: ChartDataPoint) => void;
}

// QR Code component props
export interface QRCodeProps extends BaseComponentProps {
  value: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  logo?: ImageProps['source'];
  onError?: () => void;
}

// Camera component props
export interface CameraProps extends BaseComponentProps {
  type?: CameraType;
  flashMode?: FlashMode;
  autoFocus?: boolean;
  whiteBalance?: 'auto' | 'sunny' | 'cloudy' | 'shadow' | 'fluorescent' | 'incandescent';
  onCameraReady?: () => void;
  onMountError?: (error: any) => void;
  onBarCodeScanned?: (data: { type: string; data: string }) => void;
  onFacesDetected?: (faces: any[]) => void;
  onTextRecognized?: (text: string) => void;
}

// Map component props
export interface MapProps extends BaseComponentProps {
  latitude: number;
  longitude: number;
  latitudeDelta?: number;
  longitudeDelta?: number;
  markers?: Array<{
    id: string;
    latitude: number;
    longitude: number;
    title?: string;
    description?: string;
    pinColor?: 'red' | 'green' | 'purple';
    onPress?: () => void;
  }>;
  showsUserLocation?: boolean;
  followsUserLocation?: boolean;
  showsCompass?: boolean;
  showsScale?: boolean;
  showsBuildings?: boolean;
  showsTraffic?: boolean;
  showsIndoors?: boolean;
  onRegionChange?: (region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }) => void;
  onRegionChangeComplete?: (region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }) => void;
}

// WebView component props
export interface WebViewProps extends BaseComponentProps {
  source: { uri: string } | { html: string };
  onLoadStart?: () => void;
  onLoad?: () => void;
  onLoadEnd?: () => void;
  onError?: (error: any) => void;
  onNavigationStateChange?: (navState: any) => void;
  onMessage?: (message: any) => void;
  injectedJavaScript?: string;
  javaScriptEnabled?: boolean;
  domStorageEnabled?: boolean;
  scalesPageToFit?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  showsVerticalScrollIndicator?: boolean;
  bounces?: boolean;
  scrollEnabled?: boolean;
  automaticallyAdjustContentInsets?: boolean;
  contentInset?: { top?: number; left?: number; bottom?: number; right?: number };
  onShouldStartLoadWithRequest?: (request: any) => boolean;
  allowsBackForwardNavigationGestures?: boolean;
  allowsInlineMediaPlayback?: boolean;
  allowsFullscreenVideo?: boolean;
  mediaPlaybackRequiresUserAction?: boolean;
  originWhitelist?: string[];
  userAgent?: string;
  cacheEnabled?: boolean;
  cacheMode?: 'LOAD_DEFAULT' | 'LOAD_CACHE_ONLY' | 'LOAD_CACHE_ELSE_NETWORK' | 'LOAD_NO_CACHE';
  incognito?: boolean;
  sharedCookiesEnabled?: boolean;
  dataDetectorTypes?: ('phoneNumber' | 'link' | 'address' | 'calendarEvent' | 'trackingNumber' | 'flightNumber' | 'lookupSuggestion')[];
  decelerationRate?: 'normal' | 'fast';
  directionalLockEnabled?: boolean;
  pagingEnabled?: boolean;
  scrollEventThrottle?: number;
  useWebKit?: boolean;
  hideKeyboardAccessoryView?: boolean;
  keyboardDisplayRequiresUserAction?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  showsVerticalScrollIndicator?: boolean;
  bounces?: boolean;
  scrollEnabled?: boolean;
  automaticallyAdjustContentInsets?: boolean;
  contentInsetAdjustmentBehavior?: 'automatic' | 'scrollableAxes' | 'never' | 'always';
  onContentProcessDidTerminate?: () => void;
  onHttpError?: (error: any) => void;
  onLoadingError?: (error: any) => void;
  onLoadingFinish?: () => void;
  onLoadingProgress?: (progress: { target: number }) => void;
  onLoadingStart?: () => void;
  onMessage?: (message: any) => void;
  onScroll?: (scroll: any) => void;
  pullToRefreshEnabled?: boolean;
  onRefresh?: () => void;
  refreshControl?: ReactNode;
  renderError?: (error: any) => ReactNode;
  renderLoading?: () => ReactNode;
  startInLoadingState?: boolean;
  style?: any;
  testID?: string;
  thirdPartyCookiesEnabled?: boolean;
  urlPrefixesForDefaultIntent?: string[];
  webviewDebuggingEnabled?: boolean;
}

// Animation props
export interface AnimationProps {
  duration?: number;
  delay?: number;
  type?: AnimationType;
  useNativeDriver?: boolean;
  isInteraction?: boolean;
  onAnimationBegin?: () => void;
  onAnimationEnd?: () => void;
}

// Theme props
export interface ThemeProps {
  theme?: ThemeMode;
  colors?: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    error: string;
    warning: string;
    success: string;
    info: string;
  };
}

// Layout props
export interface LayoutProps extends BaseComponentProps {
  flex?: number;
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
  alignSelf?: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
  flexWrap?: 'wrap' | 'nowrap' | 'wrap-reverse';
  position?: 'absolute' | 'relative';
  top?: number | string;
  right?: number | string;
  bottom?: number | string;
  left?: number | string;
  zIndex?: number;
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  minHeight?: number | string;
  maxWidth?: number | string;
  maxHeight?: number | string;
  margin?: number | string;
  marginTop?: number | string;
  marginRight?: number | string;
  marginBottom?: number | string;
  marginLeft?: number | string;
  padding?: number | string;
  paddingTop?: number | string;
  paddingRight?: number | string;
  paddingBottom?: number | string;
  paddingLeft?: number | string;
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  borderTopWidth?: number;
  borderRightWidth?: number;
  borderBottomWidth?: number;
  borderLeftWidth?: number;
  borderTopColor?: string;
  borderRightColor?: string;
  borderBottomColor?: string;
  borderLeftColor?: string;
  borderTopLeftRadius?: number;
  borderTopRightRadius?: number;
  borderBottomLeftRadius?: number;
  borderBottomRightRadius?: number;
  backgroundColor?: string;
  opacity?: number;
  overflow?: 'visible' | 'hidden' | 'scroll';
  elevation?: number;
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  transform?: Array<{
    translateX?: number;
    translateY?: number;
    scale?: number;
    scaleX?: number;
    scaleY?: number;
    rotate?: string;
    rotateX?: string;
    rotateY?: string;
    rotateZ?: string;
    skewX?: string;
    skewY?: string;
    perspective?: number;
  }>;
}

// Export all enhanced component types
export type {
  BaseComponentProps,
  EnhancedViewProps,
  EnhancedTextProps,
  EnhancedTouchableProps,
  EnhancedScrollViewProps,
  EnhancedFlatListProps,
  EnhancedImageProps,
  EnhancedTextInputProps,
  ButtonProps,
  CardProps,
  ModalProps,
  LoadingProps,
  ErrorBoundaryProps,
  ToastProps,
  FormFieldProps,
  NavigationProps,
  ChartProps,
  QRCodeProps,
  CameraProps,
  MapProps,
  WebViewProps,
  AnimationProps,
  ThemeProps,
  LayoutProps,
};
