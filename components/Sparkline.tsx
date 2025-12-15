
import React, { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

interface SparklineProps {
  price: number;
  changePercent: number;
  color: string;
}

const Sparkline: React.FC<SparklineProps> = ({ price, changePercent, color }) => {
  const data = useMemo(() => {
    const points = [];
    const numPoints = 20;
    // Calculate start price based on change percent
    const startPrice = price / (1 + changePercent / 100);
    const volatility = 0.005;

    let current = startPrice;
    for (let i = 0; i < numPoints; i++) {
      // Linear interpolation + random noise
      const trend = startPrice + ((price - startPrice) * (i / (numPoints - 1)));
      const noise = current * (Math.random() - 0.5) * volatility;
      
      // Bias towards the trend line
      current = trend + noise;
      
      // Force last point to be exact current price
      if (i === numPoints - 1) current = price;

      points.push({ val: current });
    }
    return points;
  }, [price, changePercent]);

  return (
    <div className="h-10 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line 
            type="monotone" 
            dataKey="val" 
            stroke={color} 
            strokeWidth={2} 
            dot={false} 
            isAnimationActive={false}
          />
          <YAxis domain={['dataMin', 'dataMax']} hide />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default Sparkline;
