# DEX Mobile Application

Advanced React Native mobile application for DEX trading with enterprise-grade features and security.

## Features

### 🚀 Trading
- **Real-time Trading**: Instant swap execution with smart order routing
- **Portfolio Management**: Track performance across all assets

### 🔒 Security
- **Biometric Authentication**: Fingerprint and Face ID support
- **Secure Storage**: Encrypted local data storage

### 📱 User Experience
- **Multi-language Support**: 50+ languages supported
- **Dark/Light Themes**: Adaptive theming system
- **Offline Mode**: Access portfolio and data offline
- **Push Notifications**: Real-time alerts and updates

## Technology Stack

### Frontend
- **React Native 0.82.1**: Cross-platform mobile framework
- **TypeScript**: Type-safe development
- **Redux Toolkit**: State management
- **React Navigation**: Navigation system

### UI/UX
- **Custom Design System**: Consistent visual language
- **Linear Gradients**: Modern gradient effects
- **Vector Icons**: Scalable icon system
- **Responsive Layouts**: Adaptive UI components

### Security
- **React Native Keychain**: Secure credential storage
- **React Native Biometrics**: Biometric authentication

### Performance
- **React Native Screens**: Native screen optimization

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- iOS: Xcode 14+ (for iOS development)
- Android: Android Studio (for Android development)

### Installation

1. **Install dependencies**
```bash
npm install
```

2. **iOS Setup**
```bash
cd ios && pod install && cd ..
```

3. **Start Metro bundler**
```bash
npm start
```

4. **Run on device/simulator**

For iOS:
```bash
npm run ios
```

For Android:
```bash
npm run android
```

### Development

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Testing
npm run test

# Build for production
npm run build:android
npm run build:ios
```

## Project Structure

```
mobile/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── AmountInput.tsx
│   │   ├── ExecuteButton.tsx
│   │   ├── LoadingScreen.tsx
│   │   ├── PriceDisplay.tsx
│   │   └── ...
│   ├── screens/             # Screen components
│   │   ├── DashboardScreen.tsx
│   │   └── ...
│   ├── services/            # API and business logic
│   │   ├── apiClient.ts
│   │   ├── tradingService.ts
│   │   └── ...
│   ├── redux/               # State management
│   │   ├── store.ts
│   │   └── ...
│   ├── types/               # TypeScript definitions
│   ├── utils/               # Utility functions
│   └── constants/           # App constants
├── android/                 # Android native code
├── ios/                     # iOS native code
├── App.tsx                  # Main app component
└── package.json
```

## Configuration

### Environment Variables
Create `.env` file in mobile directory:

```env
API_BASE_URL=http://localhost:3001/api
ENVIRONMENT=development
ENABLE_ANALYTICS=false
ENABLE_CRASH_REPORTING=false
```

### API Configuration
The app connects to the backend API with automatic:
- Authentication token management
- Request retry logic
- Offline queue processing
- Error handling

## Features Documentation

### Trading Features
- **Real-time Trading**: Instant swap execution with smart order routing
- **Portfolio Management**: Track performance across all assets

### Security Features
- **Biometric Authentication**: Fingerprint and Face ID support
- **Secure Storage**: Encrypted local data storage

## Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Performance testing
npm run test:performance
```

## Deployment

### iOS
1. Update version in `ios/DEXMobile/Info.plist`
2. Run `npm run build:ios`
3. Upload to TestFlight/App Store

### Android
1. Update version in `android/app/build.gradle`
2. Run `npm run build:android`
3. Upload to Google Play Store

## Contributing

1. Follow TypeScript and React Native best practices
2. Write tests for new features
3. Update documentation
4. Follow the established code style
5. Ensure cross-platform compatibility

## License

This project is licensed under the MIT License.

## Version History

### 1.0.0 (Current)
- Initial release
- Basic trading functionality
- Portfolio management
- Security features
- Multi-language support
