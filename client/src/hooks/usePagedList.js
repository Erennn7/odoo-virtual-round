import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

/**
 * Shared list-page state machine: search (debounced), filters, sort,
 * pagination and refetching — used by every directory/list screen
 * so the behavior is identical across the app.
 */
export function usePagedList(url, { initialFilters = {}, limit = 10 } = {}) {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearchRaw] = useState('');
  const [filters, setFiltersRaw] = useState(initialFilters);
  const [sort, setSortState] = useState(null);
  const debounceRef = useRef(null);
  const searchRef = useRef('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit, search: searchRef.current || undefined, ...filters };
      if (sort) { params.sort = sort.key; params.order = sort.order; }
      Object.keys(params).forEach((k) => (params[k] === '' || params[k] === undefined) && delete params[k]);
      const res = await api.get(url, { params });
      setRows(res.data.data);
      setPagination(res.data.pagination ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [url, page, limit, filters, sort]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const setSearch = (value) => {
    setSearchRaw(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchRef.current = value;
      setPage(1);
      fetchList();
    }, 350);
  };

  const setFilters = (updater) => {
    setFiltersRaw(updater);
    setPage(1);
  };

  const toggleSort = (key) => {
    setSortState((s) => (s?.key === key ? { key, order: s.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'asc' }));
    setPage(1);
  };

  return { rows, pagination, loading, error, page, setPage, search, setSearch, filters, setFilters, sort, toggleSort, refetch: fetchList };
}
