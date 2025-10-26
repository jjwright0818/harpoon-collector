#!/usr/bin/env python3
"""
HARPOON AI - Real-Time Trading Agent
Uses existing Supabase data to find current trading opportunities
"""

import asyncio
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
import json
import os
from dataclasses import dataclass
from supabase import create_client, Client
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
import warnings
warnings.filterwarnings('ignore')

# Load environment variables
from dotenv import load_dotenv
load_dotenv('.env.local')

@dataclass
class RealtimeOpportunity:
    """Real-time trading opportunity from Supabase data"""
    market_id: str
    question: str
    current_price: float
    action: str
    confidence: float
    expected_return: float
    risk_level: str
    signals: List[str]
    last_updated: datetime
    volume_24h: float
    whale_activity: int

class SupabaseClient:
    """Client for accessing Supabase data"""
    
    def __init__(self):
        # Load environment variables
        self.supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
        self.supabase_key = os.getenv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
        
        if not self.supabase_url or not self.supabase_key:
            raise ValueError("Supabase credentials not found in environment variables")
        
        self.supabase: Client = create_client(self.supabase_url, self.supabase_key)
    
    async def get_recent_market_data(self, hours_back: int = 20) -> pd.DataFrame:
        """Get recent market data from active_week_data table"""
        print(f"📊 Fetching market data from last {hours_back} hours...")
        
        # Calculate timestamp for filtering
        cutoff_time = datetime.now() - timedelta(hours=hours_back)
        
        try:
            # Query recent market data
            response = self.supabase.table('active_week_data')\
                .select('*')\
                .gte('snapshot_time', cutoff_time.isoformat())\
                .order('snapshot_time', desc=True)\
                .execute()
            
            if not response.data:
                print("❌ No recent market data found")
                return pd.DataFrame()
            
            df = pd.DataFrame(response.data)
            print(f"✅ Found {len(df)} market data points")
            return df
            
        except Exception as e:
            print(f"Error fetching market data: {e}")
            return pd.DataFrame()
    
    async def get_market_flow_data(self, hours_back: int = 20) -> pd.DataFrame:
        """Get market flow data to analyze price movements over time"""
        print(f"📈 Fetching market flow data from last {hours_back} hours...")
        
        cutoff_time = datetime.now() - timedelta(hours=hours_back)
        
        try:
            # Get all market data for flow analysis
            response = self.supabase.table('active_week_data')\
                .select('*')\
                .gte('snapshot_time', cutoff_time.isoformat())\
                .order('market_id, snapshot_time', desc=False)\
                .execute()
            
            if not response.data:
                return pd.DataFrame()
            
            df = pd.DataFrame(response.data)
            
            # Calculate flow metrics for each market
            flow_metrics = []
            
            for market_id in df['market_id'].unique():
                market_data = df[df['market_id'] == market_id].sort_values('snapshot_time')
                
                if len(market_data) < 2:
                    continue
                
                # Calculate price flow metrics
                prices = market_data['yes_price'].values
                volumes = market_data['volume_24h'].values
                timestamps = pd.to_datetime(market_data['snapshot_time']).values
                
                # Price momentum (recent vs earlier)
                if len(prices) >= 3:
                    recent_price = prices[-1]
                    earlier_price = prices[0]
                    price_change = (recent_price - earlier_price) / earlier_price
                    
                    # Volume momentum
                    recent_volume = volumes[-1] if len(volumes) > 0 else 0
                    avg_volume = np.mean(volumes[:-1]) if len(volumes) > 1 else recent_volume
                    volume_spike = (recent_volume - avg_volume) / avg_volume if avg_volume > 0 else 0
                    
                    # Price volatility (standard deviation)
                    price_volatility = np.std(prices) if len(prices) > 1 else 0
                    
                    # Trend direction (linear regression slope)
                    if len(prices) >= 3:
                        x = np.arange(len(prices))
                        trend_slope = np.polyfit(x, prices, 1)[0]
                    else:
                        trend_slope = 0
                    
                    # Recent acceleration (second derivative)
                    if len(prices) >= 4:
                        recent_changes = np.diff(prices[-3:])
                        acceleration = np.diff(recent_changes)[0] if len(recent_changes) > 1 else 0
                    else:
                        acceleration = 0
                    
                    flow_metrics.append({
                        'market_id': market_id,
                        'current_price': recent_price,
                        'price_change_pct': price_change,
                        'volume_spike_pct': volume_spike,
                        'price_volatility': price_volatility,
                        'trend_slope': trend_slope,
                        'acceleration': acceleration,
                        'data_points': len(prices),
                        'last_update': timestamps[-1],
                        'market_question': market_data.iloc[-1]['market_question']
                    })
            
            flow_df = pd.DataFrame(flow_metrics)
            print(f"✅ Calculated flow metrics for {len(flow_df)} markets")
            return flow_df
            
        except Exception as e:
            print(f"Error calculating flow metrics: {e}")
            return pd.DataFrame()
    
    async def get_recent_trades(self, hours_back: int = 20) -> pd.DataFrame:
        """Get recent trades from trades table"""
        print(f"📊 Fetching trade data from last {hours_back} hours...")
        
        cutoff_time = datetime.now() - timedelta(hours=hours_back)
        
        try:
            # Query recent trades
            response = self.supabase.table('trades')\
                .select('*')\
                .gte('timestamp', cutoff_time.isoformat())\
                .order('timestamp', desc=True)\
                .execute()
            
            if not response.data:
                print("❌ No recent trades found")
                return pd.DataFrame()
            
            df = pd.DataFrame(response.data)
            print(f"✅ Found {len(df)} trade records")
            return df
            
        except Exception as e:
            print(f"Error fetching trades: {e}")
            return pd.DataFrame()
    
    async def get_latest_market_snapshots(self) -> pd.DataFrame:
        """Get the most recent snapshot for each market"""
        print("📊 Fetching latest market snapshots...")
        
        try:
            # Get the most recent data for each market
            response = self.supabase.table('active_week_data')\
                .select('*')\
                .order('snapshot_time', desc=True)\
                .execute()
            
            if not response.data:
                return pd.DataFrame()
            
            df = pd.DataFrame(response.data)
            
            # Get the latest snapshot for each market
            latest_snapshots = df.groupby('market_id').first().reset_index()
            
            print(f"✅ Found {len(latest_snapshots)} unique markets")
            return latest_snapshots
            
        except Exception as e:
            print(f"Error fetching latest snapshots: {e}")
            return pd.DataFrame()

class RealtimeTradingAgent:
    """Real-time trading agent using Supabase data"""
    
    def __init__(self):
        self.supabase_client = SupabaseClient()
        self.ml_model = None
        self.scaler = StandardScaler()
        self.trained = False
        
        # Load pre-trained model if available
        self._load_pretrained_model()
    
    def _load_pretrained_model(self):
        """Load the pre-trained ML model"""
        try:
            import pickle
            # Try to load the weighted buy model first
            with open('ai/weighted_buy_model.pkl', 'rb') as f:
                model_data = pickle.load(f)
                self.ml_model = model_data['model']
                self.scaler = model_data['scaler']
                self.trained = True
            print("✅ Loaded weighted buy-only ML model")
        except:
            try:
                # Fallback to advanced model
                with open('ai/advanced_trading_agent.pkl', 'rb') as f:
                    model_data = pickle.load(f)
                    self.ml_model = model_data['model']
                    self.scaler = model_data['scaler']
                    self.trained = True
                print("✅ Loaded advanced ML model")
            except:
                print("⚠️  No pre-trained model found, using rule-based analysis")
    
    def extract_features_from_supabase(self, market_data: pd.Series, trades_data: pd.DataFrame, flow_data: pd.Series = None) -> np.ndarray:
        """Extract ML features from Supabase data"""
        features = []
        
        # Basic market features
        current_price = float(market_data.get('yes_price', 0.5))
        volume_24h = float(market_data.get('volume_24h', 100000))
        
        features.extend([
            current_price,
            volume_24h,
            float(market_data.get('no_price', 1 - current_price)),
            float(market_data.get('spread', 0.02)),
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
            volume_24h,
            1 if volume_24h > 1000000 else 0,  # High volume
            1 if volume_24h > 500000 else 0,   # Medium volume
            1 if volume_24h < 100000 else 0,   # Low volume
        ])
        
        # Trade activity features
        if not trades_data.empty:
            market_trades = trades_data[trades_data['market_id'] == market_data['market_id']]
            whale_trades = market_trades[market_trades['size'] >= 10000]
            
            features.extend([
                len(market_trades),  # Total trades
                len(whale_trades),   # Whale trades
                market_trades['size'].sum() if not market_trades.empty else 0,  # Total volume
                whale_trades['size'].sum() if not whale_trades.empty else 0,    # Whale volume
            ])
        else:
            features.extend([0, 0, 0, 0])
        
        # Time-based features
        last_update = pd.to_datetime(market_data.get('snapshot_time', datetime.now()))
        hours_since_update = (datetime.now() - last_update).total_seconds() / 3600
        
        features.extend([
            hours_since_update,
            1 if hours_since_update < 1 else 0,  # Very recent
            1 if hours_since_update < 6 else 0,  # Recent
            1 if hours_since_update > 12 else 0,  # Stale
        ])
        
        # Market type features (based on question)
        question = market_data.get('market_question', '').lower()
        features.extend([
            1 if 'fed' in question or 'rate' in question else 0,  # Fed markets
            1 if 'election' in question or 'trump' in question or 'biden' in question else 0,  # Election
            1 if 'ai' in question or 'artificial intelligence' in question else 0,  # AI
            1 if 'crypto' in question or 'bitcoin' in question or 'ethereum' in question else 0,  # Crypto
            1 if 'recession' in question or 'economy' in question else 0,  # Economic
        ])
        
        # Flow features (NEW!) - Price momentum and volume patterns
        if flow_data is not None:
            features.extend([
                flow_data.get('price_change_pct', 0),  # Price momentum
                flow_data.get('volume_spike_pct', 0),  # Volume spike
                flow_data.get('price_volatility', 0),  # Price volatility
                flow_data.get('trend_slope', 0),  # Trend direction
                flow_data.get('acceleration', 0),  # Price acceleration
                flow_data.get('data_points', 0) / 100,  # Data quality (normalized)
            ])
        else:
            # Add zeros for flow features if not available
            features.extend([0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
        
        # Pad to 30 features if needed
        while len(features) < 30:
            features.append(0.0)
        
        return np.array(features[:30])
    
    def analyze_market_realtime(self, market_data: pd.Series, trades_data: pd.DataFrame, flow_data: pd.DataFrame = None) -> Dict:
        """Analyze market using real-time data"""
        
        current_price = float(market_data.get('yes_price', 0.5))
        volume_24h = float(market_data.get('volume_24h', 100000))
        question = market_data.get('market_question', '')
        
        signals = []
        confidence = 0.0
        
        # Price-based analysis
        if current_price < 0.1:
            signals.append("Extremely undervalued")
            confidence += 0.5
        elif current_price < 0.2:
            signals.append("Very undervalued")
            confidence += 0.4
        elif current_price < 0.3:
            signals.append("Undervalued")
            confidence += 0.3
        elif current_price > 0.9:
            signals.append("Extremely overvalued")
            confidence += 0.5
        elif current_price > 0.8:
            signals.append("Very overvalued")
            confidence += 0.4
        elif current_price > 0.7:
            signals.append("Overvalued")
            confidence += 0.3
        
        # Volume analysis
        if volume_24h > 2000000:
            signals.append("Exceptional volume")
            confidence += 0.3
        elif volume_24h > 1000000:
            signals.append("Very high volume")
            confidence += 0.2
        elif volume_24h > 500000:
            signals.append("High volume")
            confidence += 0.1
        elif volume_24h < 100000:
            signals.append("Low volume")
            confidence -= 0.1
        
        # Trade activity analysis
        if not trades_data.empty:
            market_trades = trades_data[trades_data['market_id'] == market_data['market_id']]
            whale_trades = market_trades[market_trades['size'] >= 10000]
            
            if len(whale_trades) > 10:
                signals.append("Very high whale activity")
                confidence += 0.3
            elif len(whale_trades) > 5:
                signals.append("High whale activity")
                confidence += 0.2
            elif len(whale_trades) > 0:
                signals.append("Some whale activity")
                confidence += 0.1
            else:
                signals.append("No whale activity")
                confidence -= 0.1
        
        # Recency analysis
        last_update = pd.to_datetime(market_data.get('snapshot_time', datetime.now()))
        hours_since_update = (datetime.now() - last_update).total_seconds() / 3600
        
        if hours_since_update < 1:
            signals.append("Very recent data")
            confidence += 0.2
        elif hours_since_update < 6:
            signals.append("Recent data")
            confidence += 0.1
        elif hours_since_update > 12:
            signals.append("Stale data")
            confidence -= 0.2
        
        # Market type analysis
        if 'fed' in question.lower() or 'rate' in question.lower():
            signals.append("Fed market - high volatility")
            confidence += 0.1
        elif 'ai' in question.lower():
            signals.append("AI market - trending")
            confidence += 0.1
        elif 'election' in question.lower():
            signals.append("Election market - high interest")
            confidence += 0.1
        
        # Flow analysis (NEW!) - Analyze price momentum and volume patterns
        if flow_data is not None and not flow_data.empty:
            market_flow = flow_data[flow_data['market_id'] == market_data['market_id']]
            if not market_flow.empty:
                flow = market_flow.iloc[0]
                
                # Price momentum signals
                price_change = flow.get('price_change_pct', 0)
                if price_change > 0.15:  # 15%+ price increase
                    signals.append(f"🚀 Strong momentum (+{price_change:.1%})")
                    confidence += 0.3
                elif price_change > 0.08:  # 8%+ price increase
                    signals.append(f"📈 Upward momentum (+{price_change:.1%})")
                    confidence += 0.2
                elif price_change > 0.03:  # 3%+ price increase
                    signals.append(f"⬆️ Rising price (+{price_change:.1%})")
                    confidence += 0.1
                elif price_change < -0.1:  # 10%+ price decrease
                    signals.append(f"📉 Price decline ({price_change:.1%})")
                    confidence -= 0.15
                
                # Volume spike signals
                volume_spike = flow.get('volume_spike_pct', 0)
                if volume_spike > 2.0:  # 200%+ volume spike
                    signals.append(f"🔥 Massive volume surge (+{volume_spike:.0%})")
                    confidence += 0.25
                elif volume_spike > 1.0:  # 100%+ volume spike
                    signals.append(f"⚡ Volume spike (+{volume_spike:.0%})")
                    confidence += 0.2
                elif volume_spike > 0.5:  # 50%+ volume spike
                    signals.append(f"📊 Rising volume (+{volume_spike:.0%})")
                    confidence += 0.15
                
                # Trend and acceleration signals
                trend_slope = flow.get('trend_slope', 0)
                acceleration = flow.get('acceleration', 0)
                
                if trend_slope > 0.002 and acceleration > 0.001:  # Strong accelerating trend
                    signals.append("🚀 Accelerating trend")
                    confidence += 0.25
                elif trend_slope > 0.001:  # Upward trend
                    signals.append("📈 Upward trend")
                    confidence += 0.15
                elif trend_slope < -0.001:  # Downward trend
                    signals.append("📉 Downward trend")
                    confidence -= 0.1
                
                # Volatility and data quality
                volatility = flow.get('price_volatility', 0)
                data_points = flow.get('data_points', 0)
                
                if volatility > 0.08:  # High volatility
                    signals.append("⚡ High volatility")
                    confidence += 0.1  # Volatile markets = more opportunity
                
                if data_points >= 10:  # Good data quality
                    signals.append("📊 Strong data history")
                    confidence += 0.05
        
        # ML prediction if model is available
        if self.trained:
            try:
                # Get flow data for this market
                market_flow = None
                if flow_data is not None and not flow_data.empty:
                    market_flow = flow_data[flow_data['market_id'] == market_data['market_id']]
                    if not market_flow.empty:
                        market_flow = market_flow.iloc[0]
                
                features = self.extract_features_from_supabase(market_data, trades_data, market_flow)
                features_scaled = self.scaler.transform(features.reshape(1, -1))
                prediction = self.ml_model.predict(features_scaled)[0]
                probabilities = self.ml_model.predict_proba(features_scaled)[0]
                
                ml_confidence = np.max(probabilities)
                if ml_confidence > 0.7:
                    actions = ['BUY', 'SELL', 'HOLD']
                    ml_action = actions[prediction]
                    signals.append(f"ML prediction: {ml_action} ({ml_confidence:.1%})")
                    confidence += ml_confidence * 0.3  # Weight ML prediction
            except:
                pass
        
        # Determine final action
        # Only suggest BUY actions (no SELL since we don't have shares)
        # Focus on reasonable opportunities, not extreme long shots
        if confidence > 0.7:
            if 0.1 <= current_price <= 0.4:  # Reasonable undervalued range
                action = "BUY"
            else:
                action = "HOLD"
        elif confidence > 0.6:
            if 0.15 <= current_price <= 0.35:  # More conservative range
                action = "BUY"
            else:
                action = "HOLD"
        else:
            action = "HOLD"
        
        return {
            'action': action,
            'confidence': min(0.95, max(0.05, confidence)),
            'signals': signals
        }
    
    async def retrain_with_flow_data(self):
        """Retrain the ML model with flow data for better momentum understanding"""
        print("🔄 Retraining ML model with flow data...")
        
        try:
            # Get historical data with flow metrics
            market_data = await self.supabase_client.get_recent_market_data(hours_back=168)  # 7 days
            trades_data = await self.supabase_client.get_recent_trades(hours_back=168)
            flow_data = await self.supabase_client.get_market_flow_data(hours_back=168)
            
            if market_data.empty or flow_data.empty:
                print("❌ Insufficient data for retraining")
                return False
            
            # Prepare training data with flow features
            X = []
            y = []
            
            for _, market in market_data.iterrows():
                try:
                    # Get flow data for this market
                    market_flow = flow_data[flow_data['market_id'] == market['market_id']]
                    if market_flow.empty:
                        continue
                    
                    flow = market_flow.iloc[0]
                    
                    # Extract features including flow data
                    features = self.extract_features_from_supabase(market, trades_data, flow)
                    X.append(features)
                    
                    # Create target based on price momentum and outcome
                    price_change = flow.get('price_change_pct', 0)
                    volume_spike = flow.get('volume_spike_pct', 0)
                    
                    # Determine if this was a good trade opportunity
                    if price_change > 0.1 and volume_spike > 0.5:  # Strong momentum + volume
                        y.append(0)  # BUY
                    elif price_change < -0.1:  # Declining price
                        y.append(1)  # SELL
                    else:
                        y.append(2)  # HOLD
                        
                except Exception as e:
                    continue
            
            if len(X) < 50:
                print("❌ Not enough data points for retraining")
                return False
            
            X = np.array(X)
            y = np.array(y)
            
            # Scale features
            from sklearn.preprocessing import StandardScaler
            self.scaler = StandardScaler()
            X_scaled = self.scaler.fit_transform(X)
            
            # Retrain model
            from sklearn.ensemble import RandomForestClassifier
            self.ml_model = RandomForestClassifier(
                n_estimators=100,
                max_depth=10,
                random_state=42,
                class_weight='balanced'
            )
            
            self.ml_model.fit(X_scaled, y)
            self.trained = True
            
            # Save retrained model
            import pickle
            with open('ai/flow_enhanced_model.pkl', 'wb') as f:
                pickle.dump({
                    'model': self.ml_model,
                    'scaler': self.scaler,
                    'feature_count': X.shape[1]
                }, f)
            
            print(f"✅ Retrained model with {len(X)} samples and {X.shape[1]} features")
            print(f"   - BUY samples: {sum(y == 0)}")
            print(f"   - SELL samples: {sum(y == 1)}")
            print(f"   - HOLD samples: {sum(y == 2)}")
            
            return True
            
        except Exception as e:
            print(f"❌ Error retraining model: {e}")
            return False
    
    async def find_realtime_opportunities(self, limit: int = 20) -> List[RealtimeOpportunity]:
        """Find real-time trading opportunities from Supabase data"""
        print("🎯 Finding real-time opportunities from Supabase data...")
        
        # Get latest market snapshots
        market_data = await self.supabase_client.get_latest_market_snapshots()
        if market_data.empty:
            print("❌ No market data available")
            return []
        
        # Get recent trades
        trades_data = await self.supabase_client.get_recent_trades(hours_back=20)
        
        # Get market flow data (NEW!)
        flow_data = await self.supabase_client.get_market_flow_data(hours_back=20)
        
        opportunities = []
        
        for _, market in market_data.iterrows():
            try:
                # Analyze market with flow data
                analysis = self.analyze_market_realtime(market, trades_data, flow_data)
                
                # Get current price first
                current_price = float(market.get('yes_price', 0.5))
                volume_24h = float(market.get('volume_24h', 100000))
                
                # Only include high-confidence opportunities with reasonable risk
                # Check both YES and NO for undervalued opportunities
                yes_price = current_price
                no_price = 1.0 - current_price
                
                # Check if YES is undervalued (price < 0.5) or NO is undervalued (price > 0.5)
                is_yes_undervalued = yes_price < 0.5 and yes_price >= 0.1 and yes_price <= 0.4
                is_no_undervalued = no_price < 0.5 and no_price >= 0.1 and no_price <= 0.4
                
                if (analysis['action'] != 'HOLD' and 
                    analysis['confidence'] > 0.6 and
                    (is_yes_undervalued or is_no_undervalued)):
                    
                    # Determine which outcome to buy based on value
                    # Buy the undervalued outcome
                    if is_yes_undervalued:  # YES is undervalued
                        outcome = "YES"
                        buy_price = yes_price
                        expected_return = (1.0 - yes_price) / yes_price
                        confidence_in_odds = analysis['confidence']
                    elif is_no_undervalued:  # NO is undervalued
                        outcome = "NO"
                        buy_price = no_price
                        expected_return = (1.0 - no_price) / no_price
                        confidence_in_odds = analysis['confidence']
                    else:
                        continue  # Skip if neither is undervalued
                    
                    # Don't cap the return - show the real potential
                    # But filter out extremely high-risk bets
                    
                    # Determine risk level
                    risk_level = "LOW"
                    if volume_24h < 200000:
                        risk_level = "HIGH"
                    elif volume_24h < 500000:
                        risk_level = "MEDIUM"
                    
                    # Count whale activity
                    whale_activity = 0
                    if not trades_data.empty:
                        market_trades = trades_data[trades_data['market_id'] == market['market_id']]
                        whale_activity = len(market_trades[market_trades['size'] >= 10000])
                    
                    opportunity = RealtimeOpportunity(
                        market_id=market['market_id'],
                        question=market.get('market_question', 'Unknown market'),
                        current_price=buy_price,  # Price of the outcome we're buying
                        action=f"BUY {outcome}",
                        confidence=confidence_in_odds,
                        expected_return=expected_return,
                        risk_level=risk_level,
                        signals=analysis['signals'],
                        last_updated=pd.to_datetime(market.get('snapshot_time', datetime.now())),
                        volume_24h=volume_24h,
                        whale_activity=whale_activity
                    )
                    
                    opportunities.append(opportunity)
                
            except Exception as e:
                print(f"Error analyzing market {market.get('market_id', 'unknown')}: {e}")
                continue
        
        # Sort by confidence and expected return
        opportunities.sort(key=lambda x: (x.confidence, x.expected_return), reverse=True)
        
        print(f"✅ Found {len(opportunities)} real-time opportunities")
        return opportunities[:limit]
    
    async def get_market_summary(self) -> Dict:
        """Get summary of current market data"""
        print("📊 Generating market summary...")
        
        # Get recent data
        market_data = await self.supabase_client.get_recent_market_data(hours_back=20)
        trades_data = await self.supabase_client.get_recent_trades(hours_back=20)
        
        if market_data.empty:
            return {}
        
        # Calculate summary statistics
        total_markets = len(market_data['market_id'].unique())
        total_volume = market_data['volume_24h'].sum()
        avg_price = market_data['yes_price'].mean()
        
        # Recent activity
        recent_trades = len(trades_data)
        whale_trades = len(trades_data[trades_data['size'] >= 10000]) if not trades_data.empty else 0
        
        # Price distribution
        low_price_markets = len(market_data[market_data['yes_price'] < 0.3])
        high_price_markets = len(market_data[market_data['yes_price'] > 0.7])
        
        return {
            'total_markets': total_markets,
            'total_volume_24h': total_volume,
            'average_price': avg_price,
            'recent_trades': recent_trades,
            'whale_trades': whale_trades,
            'low_price_markets': low_price_markets,
            'high_price_markets': high_price_markets,
            'data_freshness': f"Last 20 hours"
        }

async def main():
    """Main function"""
    print("🚀 HARPOON AI - Real-Time Trading Agent")
    print("=" * 60)
    print("Analyzing your Supabase data for current opportunities")
    print()
    
    try:
        # Initialize agent
        agent = RealtimeTradingAgent()
        
        # Retrain model with flow data for better momentum understanding
        print("🔄 Enhancing AI with flow analysis...")
        retrain_success = await agent.retrain_with_flow_data()
        if retrain_success:
            print("✅ AI enhanced with momentum and flow analysis!")
        else:
            print("⚠️  Using existing model (flow analysis still active)")
        
        # Get market summary
        print("Step 1: Market Summary")
        summary = await agent.get_market_summary()
        
        if summary:
            print("\n📊 MARKET SUMMARY:")
            print("=" * 40)
            print(f"Total Markets: {summary['total_markets']:,}")
            print(f"Total Volume (24h): ${summary['total_volume_24h']:,.0f}")
            print(f"Average Price: {summary['average_price']:.3f}")
            print(f"Recent Trades: {summary['recent_trades']:,}")
            print(f"Whale Trades: {summary['whale_trades']:,}")
            print(f"Low Price Markets: {summary['low_price_markets']:,}")
            print(f"High Price Markets: {summary['high_price_markets']:,}")
        
        # Find opportunities
        print("\nStep 2: Finding Real-Time Opportunities")
        opportunities = await agent.find_realtime_opportunities(limit=15)
        
        # Display opportunities
        print("\n🎯 REAL-TIME TRADING OPPORTUNITIES:")
        print("=" * 80)
        
        if not opportunities:
            print("No high-confidence opportunities found in current data.")
            print("This could mean:")
            print("- Markets are fairly valued")
            print("- Need more recent data")
            print("- AI is being selective for quality")
        else:
            for i, opp in enumerate(opportunities, 1):
                print(f"\n{i}. {opp.question[:60]}...")
                
                # Parse the action to get the outcome
                if "BUY YES" in opp.action:
                    outcome = "YES"
                    buy_price = opp.current_price
                    no_price = 1 - buy_price
                else:  # BUY NO
                    outcome = "NO"
                    no_price = opp.current_price
                    buy_price = 1 - no_price
                
                print(f"   Action: {opp.action}")
                print(f"   Buying: {outcome} shares at {buy_price:.1%}")
                print(f"   AI Confidence in {outcome}: {opp.confidence:.1%}")
                print(f"   Current Market Odds: YES {buy_price:.1%} | NO {no_price:.1%}")
                
                # Show realistic expected return
                if opp.expected_return > 0:
                    print(f"   Expected Return: {opp.expected_return:.1%} (if {outcome} wins)")
                else:
                    print(f"   Expected Return: Not recommended (overvalued)")
                
                print(f"   Risk Level: {opp.risk_level}")
                print(f"   Volume (24h): ${opp.volume_24h:,.0f}")
                print(f"   Whale Activity: {opp.whale_activity} trades")
                print(f"   Last Updated: {opp.last_updated.strftime('%Y-%m-%d %H:%M')}")
                print(f"   Key Signals: {', '.join(opp.signals[:3])}")
        
        print("\n✅ Real-time analysis complete!")
        print("💡 Tip: Run this script regularly to get fresh opportunities as new data comes in!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        print("Make sure your Supabase credentials are set in .env.local")

if __name__ == "__main__":
    asyncio.run(main())
