/**
 * Dashboard Screen
 *
 * Main trading dashboard with:
 * - Portfolio overview
 * - Price charts
 * - Quick swap interface
 * - Market indicators
 * - Recent transactions
 * - Price alerts
 * - Market news
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Dimensions,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { LineChart } from 'react-native-chart-kit';
import { StackNavigationProp } from '@react-navigation/stack';

// Types
import { RootState } from '../redux/store';
import { TradeStackParamList } from '../types/navigation';

// Services
import { tradingService } from '../services/tradingService';
import { portfolioService } from '../services/portfolioService';
import { priceService } from '../services/priceService';

// Components
import { PortfolioCard } from '../components/PortfolioCard';
import { PriceChart } from '../components/PriceChart';
import { QuickSwap } from '../components/QuickSwap';
import { MarketIndicators } from '../components/MarketIndicators';
import { RecentTransactions } from '../components/RecentTransactions';
import { PriceAlerts } from '../components/PriceAlerts';
import { MarketNews } from '../components/MarketNews';

// Styles
import { DashboardStyles } from '../styles/DashboardStyles';
import { GlobalStyles } from '../styles/GlobalStyles';

type DashboardScreenNavigationProp = StackNavigationProp<TradeStackParamList, 'Dashboard'>;

interface Props {
  navigation: DashboardScreenNavigationProp;
}

interface DashboardData {
  portfolio: {
    totalValue: number;
    change24h: number;
    changePercent24h: number;
    topAssets: Array<{
      symbol: string;
      value: number;
      change: number;
    }>;
  };
  prices: {
    [symbol: string]: {
      price: number;
      change24h: number;
      changePercent24h: number;
      volume24h: number;
    };
  };
  market: {
    fearGreedIndex: number;
    dominance: {
      btc: number;
      eth: number;
    };
    volume24h: number;
  };
}

const { width } = Dimensions.get('window');

export const DashboardScreen: React.FC<Props> = ({ navigation }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const user = useSelector((state: RootState) => state.user);
  const theme = useSelector((state: RootState) => state.theme);

  const dispatch = useDispatch();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setError(null);
      setIsLoading(true);

      // Fetch dashboard data in parallel
      const [portfolioData, priceData, marketData] = await Promise.all([
        portfolioService.getPortfolioSummary(),
        priceService.getTopTokenPrices(),
        tradingService.getMarketOverview(),
      ]);

      setDashboardData({
        portfolio: portfolioData,
        prices: priceData,
        market: marketData,
      });

      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError('Failed to load dashboard data. Please try again.');
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDashboardData();
    setIsRefreshing(false);
  };

  const handleQuickSwap = () => {
    navigation.navigate('Swap');
  };

  const handleViewChart = (symbol: string) => {
    navigation.navigate('Chart', { symbol });
  };

  const handleViewPortfolio = () => {
    navigation.navigate('Portfolio');
  };

  const handleCreateAlert = () => {
    // Navigate to alert creation
    Alert.alert('Create Price Alert', 'This feature is coming soon!');
  };

  if (isLoading && !dashboardData) {
    return (
      <View style={DashboardStyles.loadingContainer}>
        <Text style={DashboardStyles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={DashboardStyles.errorContainer}>
        <Text style={DashboardStyles.errorText}>{error}</Text>
        <TouchableOpacity style={DashboardStyles.retryButton} onPress={loadDashboardData}>
          <Text style={DashboardStyles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={DashboardStyles.container}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Portfolio Overview */}
      {dashboardData?.portfolio && (
        <PortfolioCard
          portfolio={dashboardData.portfolio}
          onPress={handleViewPortfolio}
        />
      )}

      {/* Quick Actions */}
      <View style={DashboardStyles.quickActionsContainer}>
        <TouchableOpacity
          style={DashboardStyles.quickActionButton}
          onPress={handleQuickSwap}
        >
          <Text style={DashboardStyles.quickActionText}>Quick Swap</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={DashboardStyles.quickActionButton}
          onPress={handleCreateAlert}
        >
          <Text style={DashboardStyles.quickActionText}>Price Alert</Text>
        </TouchableOpacity>
      </View>

      {/* Market Overview */}
      {dashboardData?.market && (
        <MarketIndicators marketData={dashboardData.market} />
      )}

      {/* Price Charts */}
      <View style={DashboardStyles.chartsContainer}>
        <Text style={DashboardStyles.sectionTitle}>Top Tokens</Text>
        {Object.entries(dashboardData?.prices || {}).slice(0, 5).map(([symbol, data]) => (
          <TouchableOpacity
            key={symbol}
            style={DashboardStyles.tokenRow}
            onPress={() => handleViewChart(symbol)}
          >
            <View style={DashboardStyles.tokenInfo}>
              <Text style={DashboardStyles.tokenSymbol}>{symbol}</Text>
              <Text style={DashboardStyles.tokenPrice}>${data.price.toFixed(2)}</Text>
            </View>
            <View style={DashboardStyles.tokenChange}>
              <Text
                style={[
                  DashboardStyles.tokenChangeText,
                  { color: data.changePercent24h >= 0 ? '#4CAF50' : '#f44336' }
                ]}
              >
                {data.changePercent24h >= 0 ? '+' : ''}{data.changePercent24h.toFixed(2)}%
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recent Transactions */}
      <RecentTransactions
        transactions={[]} // Would be fetched from API
        onTransactionPress={(transaction) => {
          // Navigate to transaction details
        }}
      />

      {/* Price Alerts */}
      <PriceAlerts
        alerts={[]} // Would be fetched from API
        onAlertPress={(alert) => {
          // Navigate to alert details
        }}
        onCreatePress={handleCreateAlert}
      />

      {/* Market News */}
      <MarketNews
        news={[]} // Would be fetched from API
        onNewsPress={(article) => {
          // Navigate to article
        }}
      />

      {/* Bottom spacing */}
      <View style={DashboardStyles.bottomSpacing} />
    </ScrollView>
  );
};
