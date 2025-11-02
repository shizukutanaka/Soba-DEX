import React, { useState, useEffect, useMemo } from 'react';
import { TransactionStatus } from './TransactionStatus';
import { useTransaction } from '../hooks/useTransaction';
import { useDebounce } from '../hooks/useDebounce';
import { validation } from '../utils/validation';
import { DEX_CONSTANTS } from '../utils/constants';

interface TradingFormProps {
  symbol: string;
  price: number;
  isConnected: boolean;
  walletAddress: string;
  balance: string;
  onError: (error: string) => void;
  onLoading: (loading: boolean) => void;
  onOrderSubmit?: (order: OrderData) => void;
}

interface OrderData {
  type: 'market' | 'limit' | 'stop';
  side: 'buy' | 'sell';
  amount: number;
  price?: number;
  stopPrice?: number;
  total: number;
}

export const TradingForm: React.FC<TradingFormProps> = ({
  symbol,
  price: currentPrice,
  isConnected,
  walletAddress: _walletAddress,
  balance,
  onError,
  onLoading,
  onOrderSubmit,
}) => {
  const { txState, executeTransaction, clearTransaction } = useTransaction();
  const [activeTab, setActiveTab] = useState(0);
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [sliderValue, setSliderValue] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  // Debounce validation to reduce unnecessary calculations
  const debouncedAmount = useDebounce(amount, 300);
  const debouncedPrice = useDebounce(price, 300);

  const side = activeTab === 0 ? 'buy' : 'sell';
  const [baseAsset, quoteAsset] = symbol.split('/');

  useEffect(() => {
    if (orderType === 'market') {
      setPrice(currentPrice.toString());
    }
  }, [currentPrice, orderType]);

  // Memoize expensive calculations
  const calculateTotal = useMemo((): number => {
    const amountNum = parseFloat(debouncedAmount) || 0;
    const priceNum =
      orderType === 'market' ? currentPrice : parseFloat(debouncedPrice) || 0;
    return amountNum * priceNum;
  }, [debouncedAmount, debouncedPrice, orderType, currentPrice]);

  const calculateMaxAmount = useMemo((): number => {
    const walletBalance = parseFloat(balance) || 0;
    if (side === 'buy') {
      const priceNum =
        orderType === 'market'
          ? currentPrice
          : parseFloat(debouncedPrice) || currentPrice;
      return walletBalance / priceNum;
    } else {
      return walletBalance;
    }
  }, [balance, side, orderType, currentPrice, debouncedPrice]);

  const handleSliderInput = (value: number) => {
    setSliderValue(value);
    const calculatedAmount = (calculateMaxAmount * value) / 100;
    setAmount(calculatedAmount.toFixed(6));
  };

  const handleQuickAmount = (percentage: number) => {
    const calculatedAmount = (calculateMaxAmount * percentage) / 100;
    setAmount(calculatedAmount.toFixed(6));
    setSliderValue(percentage);
  };

  const validateOrder = (): string[] => {
    const errors: string[] = [];
    const walletBalance = parseFloat(balance) || 0;

    if (!isConnected) {
      errors.push('Please connect your wallet');
      return errors;
    }

    if (!validation.isValidAmount(amount)) {
      errors.push('Invalid amount');
    }

    if (orderType !== 'market' && !validation.isValidAmount(price)) {
      errors.push('Invalid price');
    }

    const amountNum = parseFloat(amount);
    const total = calculateTotal;

    if (side === 'buy' && total > walletBalance) {
      errors.push('Insufficient balance');
    }

    if (side === 'sell' && amountNum > walletBalance) {
      errors.push('Insufficient balance');
    }

    if (orderType === 'stop' && !validation.isValidAmount(stopPrice)) {
      errors.push('Invalid stop price');
    }

    return errors;
  };

  const handleSubmit = async () => {
    const validationErrors = validateOrder();
    setErrors(validationErrors);

    if (validationErrors.length === 0) {
      await executeTransaction(async () => {
        const orderData: OrderData = {
          type: orderType,
          side,
          amount: parseFloat(amount),
          total: calculateTotal,
        };

        if (orderType !== 'market') {
          orderData.price = parseFloat(price);
        }

        if (orderType === 'stop') {
          orderData.stopPrice = parseFloat(stopPrice);
        }

        // Simulate transaction
        await new Promise(resolve => setTimeout(resolve, 2000));

        onOrderSubmit?.(orderData);

        // Reset form on success
        setAmount('');
        setPrice('');
        setStopPrice('');
        setSliderValue(0);
        setErrors([]);

        return { hash: '0x' + Math.random().toString(16).slice(2) };
      });
    }
  };


  const getButtonText = () => {
    const action = side === 'buy' ? 'Buy' : 'Sell';
    return `${action} ${baseAsset}`;
  };

  const isPending = txState.status === 'pending';
  const isSubmitDisabled = isPending || !amount || parseFloat(amount) <= 0 || errors.length > 0;
  const formattedBalance = parseFloat(balance || '0').toFixed(6);
  const truncatedAddress = _walletAddress
    ? `${_walletAddress.slice(0, 6)}…${_walletAddress.slice(-4)}`
    : null;

  return (
    <section className="trading-form atlas-card" aria-busy={isPending}>
      <header className="trading-form__header">
        <div className="trading-form__title">
          <h3>Trade {symbol}</h3>
          <div className="trading-form__meta">
            <span>Balance: {formattedBalance} {side === 'buy' ? quoteAsset : baseAsset}</span>
            {truncatedAddress && <span>Wallet: {truncatedAddress}</span>}
          </div>
        </div>
        <div className="trading-form__price" aria-live="polite">
          <span className="trading-form__price-label">Last price</span>
          <span className="trading-form__price-value">${currentPrice.toFixed(2)}</span>
        </div>
      </header>

      <div className="segmented-control" role="tablist" aria-label="Order side">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 0}
          className={`segmented-control__button segmented-control__button--buy ${activeTab === 0 ? 'is-active' : ''}`}
          onClick={() => setActiveTab(0)}
        >
          Buy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 1}
          className={`segmented-control__button segmented-control__button--sell ${activeTab === 1 ? 'is-active' : ''}`}
          onClick={() => setActiveTab(1)}
        >
          Sell
        </button>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="orderType">Order Type</label>
          <select
            id="orderType"
            value={orderType}
            onChange={e => setOrderType(e.target.value as any)}
          >
            <option value="market">Market</option>
            <option value="limit">Limit</option>
            <option value="stop">Stop</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="amountInput">Amount ({baseAsset})</label>
          <input
            id="amountInput"
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder={`Amount in ${baseAsset}`}
            min="0"
            step="0.000001"
          />
        </div>

        {orderType !== 'market' && (
          <div className="form-group">
            <label htmlFor="priceInput">Price ({quoteAsset})</label>
            <input
              id="priceInput"
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder={`Price in ${quoteAsset}`}
              min="0"
              step="0.0001"
            />
            <small>Current price: {currentPrice.toFixed(2)} {quoteAsset}</small>
          </div>
        )}

        {orderType === 'stop' && (
          <div className="form-group">
            <label htmlFor="stopPriceInput">Stop Price ({quoteAsset})</label>
            <input
              id="stopPriceInput"
              type="number"
              value={stopPrice}
              onChange={e => setStopPrice(e.target.value)}
              placeholder={`Stop price in ${quoteAsset}`}
              min="0"
              step="0.0001"
            />
          </div>
        )}
      </div>

      <div className="slider-group">
        <div className="slider-group__label">
          <span>Amount selector</span>
          <span>{sliderValue}% of balance</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={sliderValue}
          onChange={e => handleSliderInput(Number(e.target.value))}
          className="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={sliderValue}
        />
        <div className="quick-amounts">
          {DEX_CONSTANTS.QUICK_AMOUNTS.map(percentage => (
            <button
              key={percentage}
              type="button"
              className="quick-btn"
              onClick={() => handleQuickAmount(percentage)}
            >
              {percentage}%
            </button>
          ))}
        </div>
      </div>

      <div className="detail-list" aria-live="polite">
        <div className="detail-list__row">
          <span>Total</span>
          <strong>{calculateTotal.toFixed(2)} {quoteAsset}</strong>
        </div>
        <div className="detail-list__row">
          <span>Available</span>
          <span>{formattedBalance} {side === 'buy' ? quoteAsset : baseAsset}</span>
        </div>
        <div className="detail-list__row">
          <span>Fee (0.1%)</span>
          <span>{(calculateTotal * 0.001).toFixed(4)} {quoteAsset}</span>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="form-errors" role="alert">
          {errors.map((error, index) => (
            <div key={index} className="form-errors__item">
              {error}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className={`primary-cta primary-cta--${side} ${isSubmitDisabled ? 'is-disabled' : ''}`}
        onClick={handleSubmit}
        disabled={isSubmitDisabled}
      >
        {isPending ? 'Processing...' : getButtonText()}
      </button>

      <div className="order-info">
        <span className="info-chip">{orderType.toUpperCase()} Order</span>
        <span className="info-chip">Last: ${currentPrice.toFixed(2)}</span>
        {orderType === 'limit' && price && (
          <span className={`info-chip ${parseFloat(price) > currentPrice ? 'higher' : 'lower'}`}>
            Limit: ${parseFloat(price).toFixed(2)}
          </span>
        )}
      </div>

      <TransactionStatus
        status={txState.status}
        txHash={txState.txHash}
        message={txState.error}
        onClose={clearTransaction}
      />
    </section>
  );
};
