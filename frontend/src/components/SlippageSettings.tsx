import React, { useState } from 'react';

interface SlippageSettingsProps {
  slippage: string;
  onSlippageChange: (slippage: string) => void;
}

export const SlippageSettings: React.FC<SlippageSettingsProps> = ({
  slippage,
  onSlippageChange,
}) => {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const presetValues = ['0.1', '0.5', '1.0'];

  const handlePresetClick = (value: string) => {
    onSlippageChange(value);
    setShowCustom(false);
  };

  const handleCustomSubmit = () => {
    const value = parseFloat(customValue);
    if (!isNaN(value) && value >= 0.1 && value <= 50) {
      onSlippageChange(customValue);
      setShowCustom(false);
    }
  };

  const getWarningLevel = (value: string) => {
    const num = parseFloat(value);
    if (num < 0.1) return 'error';
    if (num > 5) return 'warning';
    if (num > 1) return 'caution';
    return 'normal';
  };

  const warningLevel = getWarningLevel(slippage);

  return (
    <div className="slippage-settings">
      <div className="slippage-header">
        <span className="slippage-label">Slippage Tolerance</span>
        <span className={`slippage-value ${warningLevel}`}>
          {slippage}%
        </span>
      </div>

      <div className="slippage-presets">
        {presetValues.map((value) => (
          <button
            key={value}
            className={`preset-btn ${slippage === value ? 'active' : ''}`}
            onClick={() => handlePresetClick(value)}
          >
            {value}%
          </button>
        ))}
        <button
          className={`preset-btn ${showCustom ? 'active' : ''}`}
          onClick={() => setShowCustom(!showCustom)}
        >
          Custom
        </button>
      </div>

      {showCustom && (
        <div className="custom-slippage">
          <input
            type="number"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder="0.50"
            min="0.1"
            max="50"
            step="0.1"
            className="custom-input"
          />
          <button className="apply-btn" onClick={handleCustomSubmit}>
            Apply
          </button>
        </div>
      )}

      {warningLevel === 'warning' && (
        <div className="slippage-warning">
          High slippage tolerance. You may receive significantly fewer tokens.
        </div>
      )}

      {warningLevel === 'error' && (
        <div className="slippage-error">
          Slippage tolerance too low. Transaction likely to fail.
        </div>
      )}
    </div>
  );
};