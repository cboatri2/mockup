/**
 * Example Next.js Component for Product Mockup Generation
 * 
 * This component demonstrates how to:
 * 1. Call the mockup generation API
 * 2. Display the loading state
 * 3. Show the mockup when it's ready
 * 4. Handle errors
 */

import { useState } from 'react';
import axios from 'axios';
import Image from 'next/image';

export default function ProductMockupGenerator({ design, sku }) {
  // State for mockup URL and loading status
  const [mockupUrl, setMockupUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Generate the mockup
  const generateMockup = async () => {
    try {
      // Reset state
      setError(null);
      setLoading(true);
      
      // Call the API route (this will forward the request to the mockup service)
      const response = await axios.post('/api/mockups/generate', {
        designId: design.id,
        sku,
        imageUrl: design.imageUrl
      });
      
      // Check if the request was successful
      if (response.data.success) {
        setMockupUrl(response.data.mockupUrl);
      } else {
        setError(response.data.error || 'Failed to generate mockup');
      }
    } catch (error) {
      console.error('Error generating mockup:', error);
      setError(error.response?.data?.error || error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  // Determine the display mode based on state
  const renderContent = () => {
    if (loading) {
      return (
        <div className="mockup-loading">
          <div className="spinner"></div>
          <p>Generating mockup...</p>
        </div>
      );
    }
    
    if (error) {
      return (
        <div className="mockup-error">
          <p className="error-message">{error}</p>
          <button onClick={generateMockup} className="retry-button">
            Try Again
          </button>
        </div>
      );
    }
    
    if (mockupUrl) {
      return (
        <div className="mockup-result">
          <Image 
            src={mockupUrl} 
            alt={`${design.name} on ${sku} mockup`} 
            width={400} 
            height={400}
            className="mockup-image"
          />
          <button onClick={generateMockup} className="regenerate-button">
            Regenerate
          </button>
        </div>
      );
    }
    
    // Initial state
    return (
      <div className="mockup-initial">
        <p>See how your design looks on this product</p>
        <button onClick={generateMockup} className="generate-button">
          Generate Mockup
        </button>
      </div>
    );
  };
  
  return (
    <div className="product-mockup-container">
      <h3 className="mockup-title">Product Mockup</h3>
      {renderContent()}
    </div>
  );
}

// Example CSS (you would normally put this in a separate .css or .scss file)
const styles = `
.product-mockup-container {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  margin: 20px 0;
  background-color: #f9f9f9;
}

.mockup-title {
  font-size: 18px;
  margin-bottom: 20px;
}

.mockup-loading,
.mockup-error,
.mockup-result,
.mockup-initial {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  min-height: 200px;
}

.mockup-image {
  border-radius: 4px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.spinner {
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top: 4px solid #3498db;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

button {
  padding: 8px 16px;
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  margin-top: 16px;
  transition: background-color 0.2s;
}

button:hover {
  background-color: #2980b9;
}

.error-message {
  color: #e74c3c;
  text-align: center;
}
`; 