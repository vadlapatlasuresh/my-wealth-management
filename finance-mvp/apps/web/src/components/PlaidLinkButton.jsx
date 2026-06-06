import React, { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { api } from '../api';

export default function PlaidLinkButton({ onLinkSuccess, children }) {
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openWhenReady, setOpenWhenReady] = useState(false);

  const fetchLinkToken = useCallback(async () => {
    if (!api.getToken()) {
      throw new Error('Please sign in before linking an account.');
    }
    const response = await api.createPlaidLinkToken();
    if (!response?.link_token) {
      throw new Error('Server did not return a Plaid link token.');
    }
    return response.link_token;
  }, []);

  const onSuccess = useCallback(
    async (publicToken) => {
      try {
        setError(null);
        await api.exchangePlaidPublicToken(publicToken);
        setLinkToken(null);
        setOpenWhenReady(false);
        onLinkSuccess?.();
      } catch (err) {
        console.error('Error exchanging public token:', err);
        setError(err.message || 'Failed to link account.');
      }
    },
    [onLinkSuccess]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: useCallback(
      (public_token) => onSuccess(public_token),
      [onSuccess]
    ),
    onExit: useCallback((err) => {
      setOpenWhenReady(false);
      if (err != null) {
        setError(err.display_message || err.error_message || 'Plaid Link was closed with an error.');
      }
    }, []),
  });

  useEffect(() => {
    if (openWhenReady && ready && linkToken) {
      open();
      setOpenWhenReady(false);
    }
  }, [openWhenReady, ready, linkToken, open]);

  const handleClick = async () => {
    if (ready && linkToken) {
      open();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = await fetchLinkToken();
      setLinkToken(token);
      setOpenWhenReady(true);
    } catch (err) {
      console.error('Error fetching link token:', err);
      const hint =
        err.message?.includes('fetch') || err.message === 'Failed to fetch'
          ? ' Cannot reach API Gateway (http://localhost:8080). Run npm run start:backend.'
          : '';
      setError((err.message || 'Failed to get Plaid Link token.') + hint);
      setOpenWhenReady(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && <p className="error banner-error">{error}</p>}
      <button
        type="button"
        className="btn-primary btn-sm"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? 'Connecting to Plaid…' : children || 'Link Account with Plaid'}
      </button>
    </>
  );
}
