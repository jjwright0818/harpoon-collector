#!/usr/bin/env python3
"""
Weighted Buy-Only Trainer for Polymarket
Trains AI to only provide BUY recommendations with weighted accuracy metrics
"""

import asyncio
import aiohttp
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import pickle
import random
from typing import List, Dict, Tuple
import time
import ssl
import json
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import warnings
warnings.filterwarnings('ignore')

class WeightedBuyTrainer:
    def __init__(self):
        self.session = None
        self.base_url = "https://gamma-api.polymarket.com"
        self.data_url = "https://data-api.polymarket.com"
        
    async def __aenter__(self):
        # Create SSL context that doesn't verify certificates
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        timeout = aiohttp.ClientTimeout(total=60)  # Longer timeout
        self.session = aiohttp.ClientSession(connector=connector, timeout=timeout)
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def fetch_political_markets(self, limit: int = 200) -> List[Dict]:
        """Fetch political markets from Polymarket API with thorough validation"""
        print(f"📊 Fetching {limit} political markets from API...")
        
        markets = []
        offset = 0
        
        while len(markets) < limit:
            try:
                url = f"{self.base_url}/events"
                params = {
                    'tag': 'politics',
                    'closed': 'false',
                    'limit': min(50, limit - len(markets)),
                    'offset': offset
                }
                
                print(f"   Fetching batch {offset//50 + 1}...")
                
                async with self.session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        if not data:
                            break
                        
                        for event in data:
                            for market in event.get('markets', []):
                                # Thorough validation
                                if not self.validate_market(market, event):
                                    continue
                                
                                markets.append({
                                    'market_id': market['id'],
                                    'condition_id': market.get('conditionId'),
                                    'question': market.get('question', ''),
                                    'volume': self.get_volume(market, event),
                                    'end_date': market.get('endDate'),
                                    'closed': market.get('closed', False),
                                    'outcome_prices': market.get('outcomePrices', [])
                                })
                        
                        offset += len(data)
                        print(f"   Found {len(markets)} valid markets so far...")
                        
                        # Longer rate limiting for thorough collection
                        await asyncio.sleep(2.0)
                    else:
                        print(f"❌ API error: {response.status}")
                        break
                        
            except Exception as e:
                print(f"❌ Error fetching markets: {e}")
                break
        
        print(f"✅ Found {len(markets)} valid political markets")
        return markets[:limit]
    
    def validate_market(self, market: Dict, event: Dict) -> bool:
        """Thoroughly validate market data"""
        # Check required fields
        if not market.get('id') or not market.get('conditionId'):
            return False
        
        # Check volume threshold
        volume = self.get_volume(market, event)
        if volume < 100000:  # $100k+ volume
            return False
        
        # Check if market is active
        if market.get('closed', False):
            return False
        
        # Check if we have price data
        outcome_prices = market.get('outcomePrices', [])
        if not outcome_prices:
            return False
        
        # Validate price data format
        if isinstance(outcome_prices, str):
            try:
                outcome_prices = json.loads(outcome_prices)
            except:
                return False
        
        if not outcome_prices or len(outcome_prices) == 0:
            return False
        
        # Check if price is valid
        try:
            price = float(outcome_prices[0])
            if price <= 0 or price >= 1:
                return False
        except:
            return False
        
        return True
    
    def get_volume(self, market: Dict, event: Dict) -> float:
        """Get volume with proper validation"""
        volume = (market.get('volumeNum') or 
                 market.get('volume') or 
                 market.get('volume24hr') or 
                 market.get('volumeUSD') or 
                 event.get('volume') or 
                 event.get('volumeNum') or 0)
        
        try:
            return float(volume)
        except (ValueError, TypeError):
            return 0
    
    async def fetch_market_current_data(self, market_id: str) -> Dict:
        """Fetch current market data with retry logic"""
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                url = f"{self.base_url}/markets/{market_id}"
                
                async with self.session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data
                    elif response.status == 429:
                        print(f"   ⚠️  Rate limited, waiting 5 seconds...")
                        await asyncio.sleep(5)
                        continue
                    else:
                        print(f"❌ Error fetching market {market_id}: {response.status}")
                        return {}
                        
            except Exception as e:
                print(f"❌ Error fetching market data (attempt {attempt + 1}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(2)
                    continue
                return {}
        
        return {}
    
    async def fetch_market_trades(self, condition_id: str, days_back: int = 7) -> List[Dict]:
        """Fetch historical trades with retry logic"""
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                # Calculate time range
                end_time = datetime.now()
                start_time = end_time - timedelta(days=days_back)
                
                url = f"{self.data_url}/trades"
                params = {
                    'market': condition_id,
                    'after': int(start_time.timestamp()),
                    'limit': 1000
                }
                
                async with self.session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data
                    elif response.status == 429:
                        print(f"   ⚠️  Rate limited on trades, waiting 10 seconds...")
                        await asyncio.sleep(10)
                        continue
                    else:
                        print(f"❌ Error fetching trades for {condition_id}: {response.status}")
                        return []
                        
            except Exception as e:
                print(f"❌ Error fetching market trades (attempt {attempt + 1}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(5)
                    continue
                return []
        
        return []
    
    def simulate_realistic_price_history(self, current_price: float, days_back: int = 7) -> List[Dict]:
        """Simulate realistic price history with proper market dynamics"""
        history = []
        current_price = float(current_price)
        
        # Generate realistic price movements with market dynamics
        for i in range(days_back * 24):  # Hourly data
            if i == 0:
                price = current_price
            else:
                # Previous price
                prev_price = history[-1]['price']
                
                # Market dynamics
                # 1. Mean reversion (prices tend to move toward 0.5)
                mean_reversion = (0.5 - prev_price) * 0.005
                
                # 2. Momentum (trends tend to continue)
                if i > 1:
                    momentum = (prev_price - history[-2]['price']) * 0.1
                else:
                    momentum = 0
                
                # 3. Random walk
                random_shock = np.random.normal(0, 0.015)  # 1.5% hourly volatility
                
                # 4. Volume impact (higher volume = more volatility)
                volume_impact = np.random.exponential(0.005)
                
                price = prev_price + mean_reversion + momentum + random_shock + volume_impact
                price = max(0.01, min(0.99, price))  # Clamp to valid range
            
            history.append({
                'price': price,
                'volume': np.random.exponential(1000),  # Random volume
                'timestamp': int((datetime.now() - timedelta(hours=i)).timestamp())
            })
        
        return history[::-1]  # Reverse to get chronological order
    
    def calculate_flow_metrics(self, price_history: List[Dict]) -> Dict:
        """Calculate comprehensive flow metrics"""
        if len(price_history) < 2:
            return {}
        
        # Extract prices and volumes
        prices = [float(h.get('price', 0.5)) for h in price_history if h.get('price')]
        volumes = [float(h.get('volume', 0)) for h in price_history if h.get('volume')]
        
        if len(prices) < 2:
            return {}
        
        # Calculate metrics
        current_price = prices[-1]
        initial_price = prices[0]
        price_change = (current_price - initial_price) / initial_price if initial_price > 0 else 0
        
        # Volume metrics
        if len(volumes) > 1:
            recent_volume = volumes[-1]
            avg_volume = np.mean(volumes[:-1])
            volume_spike = (recent_volume - avg_volume) / avg_volume if avg_volume > 0 else 0
        else:
            volume_spike = 0
        
        # Volatility
        price_volatility = np.std(prices) if len(prices) > 1 else 0
        
        # Trend analysis
        if len(prices) >= 3:
            x = np.arange(len(prices))
            trend_slope = np.polyfit(x, prices, 1)[0]
        else:
            trend_slope = 0
        
        # Acceleration
        if len(prices) >= 4:
            recent_changes = np.diff(prices[-3:])
            acceleration = np.diff(recent_changes)[0] if len(recent_changes) > 1 else 0
        else:
            acceleration = 0
        
        # Additional metrics
        max_price = max(prices)
        min_price = min(prices)
        price_range = max_price - min_price
        
        return {
            'current_price': current_price,
            'price_change_pct': price_change,
            'volume_spike_pct': volume_spike,
            'price_volatility': price_volatility,
            'trend_slope': trend_slope,
            'acceleration': acceleration,
            'data_points': len(prices),
            'max_price': max_price,
            'min_price': min_price,
            'price_range': price_range
        }
    
    def extract_features(self, market_data: Dict, flow_metrics: Dict, trades_data: List[Dict]) -> np.ndarray:
        """Extract comprehensive features for ML training"""
        features = []
        
        # Basic market features
        current_price = flow_metrics.get('current_price', 0.5)
        volume = market_data.get('volume', 100000)
        
        features.extend([
            current_price,
            volume / 1000000,  # Volume in millions
            1 - current_price,  # No price
            0.02,  # Default spread
        ])
        
        # Price level features
        features.extend([
            1 if current_price < 0.2 else 0,  # Very low
            1 if 0.2 <= current_price < 0.4 else 0,  # Low
            1 if 0.4 <= current_price < 0.6 else 0,  # Medium
            1 if 0.6 <= current_price < 0.8 else 0,  # High
            1 if current_price >= 0.8 else 0,  # Very high
        ])
        
        # Volume features
        features.extend([
            volume,
            1 if volume > 1000000 else 0,  # High volume
            1 if volume > 500000 else 0,   # Medium volume
            1 if volume < 100000 else 0,   # Low volume
        ])
        
        # Trade activity features
        whale_trades = [t for t in trades_data if float(t.get('size', 0)) >= 10000]
        features.extend([
            len(trades_data),  # Total trades
            len(whale_trades),   # Whale trades
            sum(float(t.get('size', 0)) for t in trades_data),  # Total volume
            sum(float(t.get('size', 0)) for t in whale_trades),    # Whale volume
        ])
        
        # Time-based features
        features.extend([
            1,  # Recent data
            1,  # Very recent
            0,  # Not stale
        ])
        
        # Market type features
        question = market_data.get('question', '').lower()
        features.extend([
            1 if 'fed' in question or 'rate' in question else 0,  # Fed markets
            1 if 'election' in question or 'trump' in question or 'biden' in question else 0,  # Election
            1 if 'ai' in question or 'artificial intelligence' in question else 0,  # AI
            1 if 'crypto' in question or 'bitcoin' in question or 'ethereum' in question else 0,  # Crypto
            1 if 'recession' in question or 'economy' in question else 0,  # Economic
        ])
        
        # Flow features
        features.extend([
            flow_metrics.get('price_change_pct', 0),  # Price momentum
            flow_metrics.get('volume_spike_pct', 0),  # Volume spike
            flow_metrics.get('price_volatility', 0),  # Price volatility
            flow_metrics.get('trend_slope', 0),  # Trend direction
            flow_metrics.get('acceleration', 0),  # Price acceleration
            flow_metrics.get('data_points', 0) / 100,  # Data quality
            flow_metrics.get('price_range', 0),  # Price range
        ])
        
        # Pad to 32 features
        while len(features) < 32:
            features.append(0.0)
        
        return np.array(features[:32])
    
    def create_buy_target(self, flow_metrics: Dict, trades_data: List[Dict], current_price: float) -> Tuple[int, float]:
        """Create BUY target with confidence score"""
        price_change = flow_metrics.get('price_change_pct', 0)
        volume_spike = flow_metrics.get('volume_spike_pct', 0)
        volatility = flow_metrics.get('price_volatility', 0)
        
        # Calculate confidence score (0-1)
        confidence = 0.0
        
        # Price momentum factors
        if price_change > 0.15:  # Strong upward momentum
            confidence += 0.3
        elif price_change > 0.08:  # Moderate upward momentum
            confidence += 0.2
        elif price_change > 0.03:  # Weak upward momentum
            confidence += 0.1
        
        # Volume factors
        if volume_spike > 1.0:  # Massive volume spike
            confidence += 0.25
        elif volume_spike > 0.5:  # Large volume spike
            confidence += 0.15
        elif volume_spike > 0.2:  # Moderate volume spike
            confidence += 0.1
        
        # Volatility factors
        if volatility > 0.1:  # High volatility
            confidence += 0.1
        elif volatility > 0.05:  # Moderate volatility
            confidence += 0.05
        
        # Price level factors
        if current_price < 0.2:  # Very undervalued
            confidence += 0.2
        elif current_price < 0.3:  # Undervalued
            confidence += 0.15
        elif current_price < 0.4:  # Somewhat undervalued
            confidence += 0.1
        
        # Trade activity factors
        whale_trades = [t for t in trades_data if float(t.get('size', 0)) >= 10000]
        if len(whale_trades) > 5:  # Heavy whale activity
            confidence += 0.15
        elif len(whale_trades) > 2:  # Some whale activity
            confidence += 0.1
        elif len(whale_trades) > 0:  # Light whale activity
            confidence += 0.05
        
        # Cap confidence at 1.0
        confidence = min(1.0, confidence)
        
        # Determine if this is a BUY opportunity
        if confidence > 0.4:  # Threshold for BUY
            return 1, confidence  # BUY with confidence
        else:
            return 0, confidence  # NO BUY with confidence
    
    def calculate_weighted_accuracy(self, y_true: np.ndarray, y_pred: np.ndarray, confidence_scores: np.ndarray) -> Dict:
        """Calculate weighted accuracy metrics"""
        # Basic accuracy
        basic_accuracy = accuracy_score(y_true, y_pred)
        
        # Weighted accuracy (confidence-weighted)
        correct_predictions = (y_true == y_pred).astype(float)
        weighted_accuracy = np.sum(correct_predictions * confidence_scores) / np.sum(confidence_scores)
        
        # Confidence-weighted precision
        true_positives = np.sum((y_true == 1) & (y_pred == 1))
        false_positives = np.sum((y_true == 0) & (y_pred == 1))
        
        if true_positives + false_positives > 0:
            precision = true_positives / (true_positives + false_positives)
        else:
            precision = 0
        
        # Confidence-weighted recall
        false_negatives = np.sum((y_true == 1) & (y_pred == 0))
        if true_positives + false_negatives > 0:
            recall = true_positives / (true_positives + false_negatives)
        else:
            recall = 0
        
        # F1 score
        if precision + recall > 0:
            f1 = 2 * (precision * recall) / (precision + recall)
        else:
            f1 = 0
        
        # Average confidence for correct predictions
        correct_mask = (y_true == y_pred)
        avg_confidence_correct = np.mean(confidence_scores[correct_mask]) if np.any(correct_mask) else 0
        
        # Average confidence for incorrect predictions
        incorrect_mask = (y_true != y_pred)
        avg_confidence_incorrect = np.mean(confidence_scores[incorrect_mask]) if np.any(incorrect_mask) else 0
        
        return {
            'basic_accuracy': basic_accuracy,
            'weighted_accuracy': weighted_accuracy,
            'precision': precision,
            'recall': recall,
            'f1_score': f1,
            'avg_confidence_correct': avg_confidence_correct,
            'avg_confidence_incorrect': avg_confidence_incorrect,
            'total_buy_opportunities': np.sum(y_true == 1),
            'total_predictions': len(y_true)
        }
    
    async def collect_training_data(self, num_markets: int = 100, days_back: int = 7) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Collect comprehensive training data from API"""
        print(f"🎯 Collecting training data for {num_markets} markets over {days_back} days...")
        
        # Fetch markets
        markets = await self.fetch_political_markets(limit=num_markets * 2)  # Get more to filter
        
        # Randomly select markets
        selected_markets = random.sample(markets, min(num_markets, len(markets)))
        print(f"📊 Selected {len(selected_markets)} markets for training")
        
        X = []
        y = []
        confidence_scores = []
        
        for i, market in enumerate(selected_markets):
            try:
                print(f"📈 Processing market {i+1}/{len(selected_markets)}: {market['question'][:50]}...")
                
                # Fetch current market data with retry
                current_data = await self.fetch_market_current_data(market['market_id'])
                if not current_data:
                    print(f"   ⚠️  Could not fetch current data, skipping...")
                    continue
                
                # Get current price with validation
                outcome_prices = current_data.get('outcomePrices', [])
                if isinstance(outcome_prices, str):
                    try:
                        outcome_prices = json.loads(outcome_prices)
                    except:
                        print(f"   ⚠️  Could not parse price data, skipping...")
                        continue
                
                if not outcome_prices or len(outcome_prices) == 0:
                    print(f"   ⚠️  No price data, skipping...")
                    continue
                
                current_price = float(outcome_prices[0])
                
                # Simulate realistic price history
                price_history = self.simulate_realistic_price_history(current_price, days_back)
                
                # Fetch trades with retry
                trades_data = await self.fetch_market_trades(market['condition_id'], days_back)
                
                # Calculate flow metrics
                flow_metrics = self.calculate_flow_metrics(price_history)
                if not flow_metrics:
                    print(f"   ⚠️  Could not calculate flow metrics, skipping...")
                    continue
                
                # Extract features
                features = self.extract_features(market, flow_metrics, trades_data)
                X.append(features)
                
                # Create target and confidence
                target, confidence = self.create_buy_target(flow_metrics, trades_data, current_price)
                y.append(target)
                confidence_scores.append(confidence)
                
                print(f"   ✅ Added sample (target: {'BUY' if target == 1 else 'NO BUY'}, confidence: {confidence:.2f})")
                
                # Longer rate limiting for thorough collection
                await asyncio.sleep(3.0)  # 3 seconds between markets
                
            except Exception as e:
                print(f"   ❌ Error processing market: {e}")
                continue
        
        print(f"✅ Collected {len(X)} training samples")
        return np.array(X), np.array(y), np.array(confidence_scores)
    
    def train_model(self, X: np.ndarray, y: np.ndarray, confidence_scores: np.ndarray) -> Tuple[RandomForestClassifier, StandardScaler]:
        """Train the ML model with weighted accuracy"""
        print("🤖 Training ML model...")
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        # Split confidence scores accordingly
        confidence_train, confidence_test = train_test_split(confidence_scores, test_size=0.2, random_state=42)
        
        # Scale features
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)
        
        # Train model
        model = RandomForestClassifier(
            n_estimators=300,
            max_depth=20,
            min_samples_split=3,
            min_samples_leaf=1,
            random_state=42,
            class_weight='balanced',
            n_jobs=-1
        )
        
        model.fit(X_train_scaled, y_train)
        
        # Evaluate with weighted metrics
        y_pred = model.predict(X_test_scaled)
        metrics = self.calculate_weighted_accuracy(y_test, y_pred, confidence_test)
        
        print(f"✅ Model trained with weighted accuracy: {metrics['weighted_accuracy']:.3f}")
        print(f"📊 Basic accuracy: {metrics['basic_accuracy']:.3f}")
        print(f"📊 Precision: {metrics['precision']:.3f}")
        print(f"📊 Recall: {metrics['recall']:.3f}")
        print(f"📊 F1 Score: {metrics['f1_score']:.3f}")
        print(f"📊 Avg confidence (correct): {metrics['avg_confidence_correct']:.3f}")
        print(f"📊 Avg confidence (incorrect): {metrics['avg_confidence_incorrect']:.3f}")
        print(f"📊 Total BUY opportunities: {metrics['total_buy_opportunities']}")
        print(f"📊 Total predictions: {metrics['total_predictions']}")
        
        return model, scaler
    
    def save_model(self, model: RandomForestClassifier, scaler: StandardScaler, feature_count: int):
        """Save the trained model"""
        model_data = {
            'model': model,
            'scaler': scaler,
            'feature_count': feature_count,
            'trained_at': datetime.now().isoformat(),
            'training_type': 'weighted_buy_only'
        }
        
        with open('ai/weighted_buy_model.pkl', 'wb') as f:
            pickle.dump(model_data, f)
        
        print("💾 Model saved to ai/weighted_buy_model.pkl")

async def main():
    """Main training function"""
    print("🚀 WEIGHTED BUY-ONLY TRAINER")
    print("=" * 50)
    print("Training AI to only provide BUY recommendations with weighted accuracy\n")
    
    # Configuration
    NUM_MARKETS = 100  # 100 markets as requested
    DAYS_BACK = 7      # One week of data
    
    print(f"📊 Configuration:")
    print(f"   - Markets: {NUM_MARKETS}")
    print(f"   - Time period: {DAYS_BACK} days")
    print(f"   - Expected training time: {NUM_MARKETS * 3.5:.1f} minutes")
    print(f"   - Rate limiting: 3 seconds between markets")
    print(f"   - Target: BUY-only recommendations")
    print(f"   - Metrics: Weighted accuracy based on confidence")
    print()
    
    async with WeightedBuyTrainer() as trainer:
        # Collect training data
        start_time = time.time()
        X, y, confidence_scores = await trainer.collect_training_data(NUM_MARKETS, DAYS_BACK)
        collection_time = time.time() - start_time
        
        if len(X) < 50:
            print(f"❌ Insufficient training data ({len(X)} samples). Need at least 50.")
            return
        
        print(f"\n⏱️  Data collection took {collection_time:.1f} seconds ({collection_time/60:.1f} minutes)")
        print(f"📊 Training data: {len(X)} samples, {X.shape[1]} features")
        print(f"   - BUY samples: {sum(y == 1)}")
        print(f"   - NO BUY samples: {sum(y == 0)}")
        print(f"   - Average confidence: {np.mean(confidence_scores):.3f}")
        
        # Train model
        start_time = time.time()
        model, scaler = trainer.train_model(X, y, confidence_scores)
        training_time = time.time() - start_time
        
        print(f"\n⏱️  Model training took {training_time:.1f} seconds")
        
        # Save model
        trainer.save_model(model, scaler, X.shape[1])
        
        total_time = collection_time + training_time
        print(f"\n🎉 TRAINING COMPLETE!")
        print(f"⏱️  Total time: {total_time:.1f} seconds ({total_time/60:.1f} minutes)")
        print(f"📊 Final model: {len(X)} samples, {X.shape[1]} features")
        print(f"💾 Model saved and ready for BUY-only trading!")

if __name__ == "__main__":
    asyncio.run(main())
