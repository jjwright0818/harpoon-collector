#!/usr/bin/env python3
"""
HARPOON AI - Site Integration Module
Integrates the trained neural network with your live site
"""

import asyncio
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import json
import torch
from neural_network_predictor import NeuralNetworkPredictor, ModelConfig

class SiteIntegration:
    """Integrates AI predictions with your live site"""
    
    def __init__(self, model_path: str = 'ai/political_market_nn.pth'):
        self.model_path = model_path
        self.predictor = None
        self.load_model()
    
    def load_model(self):
        """Load the trained neural network"""
        try:
            self.predictor = NeuralNetworkPredictor()
            self.predictor.load_model(self.model_path)
            print("✅ AI model loaded successfully")
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            self.predictor = None
    
    async def get_market_predictions(self, markets_data: List[Dict]) -> List[Dict]:
        """Get AI predictions for multiple markets"""
        if not self.predictor:
            return []
        
        predictions = []
        for market in markets_data:
            try:
                # Ensure all required features are present
                market_features = self._prepare_market_features(market)
                prediction = self.predictor.predict(market_features)
                
                # Add market info to prediction
                prediction['market_id'] = market.get('market_id')
                prediction['market_question'] = market.get('question', 'Unknown')
                prediction['timestamp'] = datetime.now().isoformat()
                
                predictions.append(prediction)
                
            except Exception as e:
                print(f"Error predicting for market {market.get('market_id', 'unknown')}: {e}")
                continue
        
        return predictions
    
    def _prepare_market_features(self, market: Dict) -> Dict:
        """Prepare market data with all required features"""
        # Default values for missing features
        defaults = {
            'yes_price': 0.5,
            'volume_24h': 100000,
            'price_change_1d': 0,
            'price_change_7d': 0,
            'whale_activity': 0,
            'spread': 0.02,
            'liquidity': 100000,
            'market_sentiment': 0,
            'volume_percentile': 0.5,
            'price_momentum': 0,
            'volatility': 0.02,
            'rsi': 50,
            'bollinger_position': 0.5,
            'macd': 0,
            'volume_ma_ratio': 1
        }
        
        # Use provided values or defaults
        features = {}
        for key, default_value in defaults.items():
            features[key] = market.get(key, default_value)
        
        return features
    
    async def get_top_opportunities(self, markets_data: List[Dict], limit: int = 5) -> List[Dict]:
        """Get top trading opportunities"""
        predictions = await self.get_market_predictions(markets_data)
        
        # Filter for high-confidence predictions
        opportunities = []
        for pred in predictions:
            if pred['confidence'] > 0.6 and pred['action'] in ['BUY', 'SELL']:
                opportunities.append(pred)
        
        # Sort by confidence
        opportunities.sort(key=lambda x: x['confidence'], reverse=True)
        
        return opportunities[:limit]
    
    async def get_market_sentiment(self, markets_data: List[Dict]) -> Dict:
        """Get overall market sentiment"""
        predictions = await self.get_market_predictions(markets_data)
        
        if not predictions:
            return {'sentiment': 'neutral', 'confidence': 0}
        
        # Calculate weighted sentiment
        total_confidence = 0
        weighted_sentiment = 0
        
        for pred in predictions:
            confidence = pred['confidence']
            if pred['action'] == 'BUY':
                sentiment_score = 1
            elif pred['action'] == 'SELL':
                sentiment_score = -1
            else:
                sentiment_score = 0
            
            weighted_sentiment += sentiment_score * confidence
            total_confidence += confidence
        
        if total_confidence == 0:
            return {'sentiment': 'neutral', 'confidence': 0}
        
        avg_sentiment = weighted_sentiment / total_confidence
        avg_confidence = total_confidence / len(predictions)
        
        if avg_sentiment > 0.2:
            sentiment = 'bullish'
        elif avg_sentiment < -0.2:
            sentiment = 'bearish'
        else:
            sentiment = 'neutral'
        
        return {
            'sentiment': sentiment,
            'confidence': avg_confidence,
            'score': avg_sentiment,
            'total_markets': len(predictions)
        }
    
    def format_predictions_for_api(self, predictions: List[Dict]) -> Dict:
        """Format predictions for API response"""
        return {
            'timestamp': datetime.now().isoformat(),
            'predictions': predictions,
            'summary': {
                'total_markets': len(predictions),
                'buy_signals': len([p for p in predictions if p['action'] == 'BUY']),
                'sell_signals': len([p for p in predictions if p['action'] == 'SELL']),
                'hold_signals': len([p for p in predictions if p['action'] == 'HOLD']),
                'avg_confidence': np.mean([p['confidence'] for p in predictions]) if predictions else 0
            }
        }

# Example usage for your site
async def demo_site_integration():
    """Demo how to integrate with your site"""
    print("🌐 HARPOON AI - Site Integration Demo")
    print("=" * 50)
    
    # Initialize integration
    integration = SiteIntegration()
    
    # Simulate market data from your database
    sample_markets = [
        {
            'market_id': 'market_1',
            'question': 'Will Trump win 2024 election?',
            'yes_price': 0.35,
            'volume_24h': 1500000,
            'price_change_1d': 0.02,
            'price_change_7d': 0.05,
            'whale_activity': 3,
            'spread': 0.015,
            'liquidity': 500000
        },
        {
            'market_id': 'market_2',
            'question': 'Will Fed cut rates in 2025?',
            'yes_price': 0.65,
            'volume_24h': 800000,
            'price_change_1d': -0.01,
            'price_change_7d': -0.03,
            'whale_activity': 1,
            'spread': 0.02,
            'liquidity': 300000
        }
    ]
    
    # Get predictions
    predictions = await integration.get_market_predictions(sample_markets)
    
    print("📊 Market Predictions:")
    for pred in predictions:
        print(f"  {pred['market_question'][:40]}...")
        print(f"    Action: {pred['action']} (Confidence: {pred['confidence']:.1%})")
        print(f"    Probabilities: BUY={pred['probabilities']['BUY']:.2f}, "
              f"SELL={pred['probabilities']['SELL']:.2f}, "
              f"HOLD={pred['probabilities']['HOLD']:.2f}")
        print()
    
    # Get top opportunities
    opportunities = await integration.get_top_opportunities(sample_markets, limit=3)
    
    print("🎯 Top Opportunities:")
    for i, opp in enumerate(opportunities, 1):
        print(f"  {i}. {opp['market_question'][:40]}...")
        print(f"     {opp['action']} (Confidence: {opp['confidence']:.1%})")
        print()
    
    # Get market sentiment
    sentiment = await integration.get_market_sentiment(sample_markets)
    
    print("📈 Market Sentiment:")
    print(f"  Overall: {sentiment['sentiment']}")
    print(f"  Confidence: {sentiment['confidence']:.1%}")
    print(f"  Score: {sentiment['score']:.2f}")
    print()
    
    # Format for API
    api_response = integration.format_predictions_for_api(predictions)
    print("🔗 API Response Format:")
    print(json.dumps(api_response, indent=2))

if __name__ == "__main__":
    asyncio.run(demo_site_integration())
