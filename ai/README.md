# Harpoon AI Trading System

## Overview
This AI system analyzes Polymarket data to provide real-time trading recommendations with weighted accuracy metrics.

## Files

### Core Files
- **`realtime_trading_agent.py`** - Main AI agent that analyzes current market data and provides BUY recommendations
- **`weighted_buy_trainer.py`** - Trainer that creates AI models using real Polymarket API data with weighted accuracy metrics
- **`weighted_buy_model.pkl`** - Trained AI model (100 markets, 9.2 minutes training, 58.3% weighted accuracy)

### Integration
- **`site_integration.py`** - Integration code for website deployment
- **`requirements.txt`** - Python dependencies

## How It Works

### 1. Data Collection
- Fetches political markets from Polymarket API
- Collects 100+ markets with $100k+ volume
- Validates all data thoroughly with retry logic

### 2. AI Training
- Uses Random Forest Classifier with 32 features
- Includes flow analysis (price momentum, volume spikes, volatility)
- Weighted accuracy metrics that consider confidence scores
- Only provides BUY recommendations (no SELL/HOLD)

### 3. Real-Time Analysis
- Loads pre-trained model
- Analyzes current Supabase data
- Provides specific recommendations:
  - **Action**: BUY YES or BUY NO
  - **Price**: Exact price to buy at
  - **Confidence**: AI confidence in the recommendation
  - **Expected Return**: Potential profit if outcome wins

## Usage

### Train New Model
```bash
python3 ai/weighted_buy_trainer.py
```

### Run Real-Time Analysis
```bash
python3 ai/realtime_trading_agent.py
```

## Performance Metrics

### Current Model (weighted_buy_model.pkl)
- **Training Data**: 100 markets, 7 days of data
- **Training Time**: 9.2 minutes
- **Weighted Accuracy**: 58.3% (realistic, considers confidence)
- **Basic Accuracy**: 70.0%
- **Precision**: 100% (all BUY predictions correct)
- **Recall**: 14.3% (conservative, high-confidence only)

### Features (32 total)
- Basic market data (price, volume, spread)
- Price level indicators (very low, low, medium, high, very high)
- Volume analysis (high, medium, low volume flags)
- Trade activity (total trades, whale trades, volumes)
- Time-based features (recency, staleness)
- Market type classification (Fed, Election, AI, Crypto, Economic)
- Flow analysis (price momentum, volume spikes, volatility, trends, acceleration)

## Example Output

```
🎯 REAL-TIME TRADING OPPORTUNITIES:

1. Will JD Vance win the 2028 US Presidential Election?...
   Action: BUY YES
   Buying: YES shares at 29.0%
   AI Confidence in YES: 70.0%
   Current Market Odds: YES 29.0% | NO 71.0%
   Expected Return: 244.8% (if YES wins)
   Risk Level: HIGH
   Volume (24h): $102,894
   Whale Activity: 1 trades
```

## Dependencies
- pandas, numpy, scikit-learn
- aiohttp (for API calls)
- supabase (for database access)
- asyncio (for async operations)

## Notes
- Model is trained on real Polymarket API data
- Uses weighted accuracy that considers confidence scores
- Only recommends BUY actions (no SELL/HOLD)
- Provides specific outcome recommendations (YES/NO)
- Includes comprehensive flow analysis for momentum detection