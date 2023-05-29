import type { Query } from '../Query.js';

const addInRange = (pages: number, currentPage: number) => (add: number) => {
  const sum = currentPage + add;
  if (sum < 0) return '0';
  if (sum > pages) return String(pages);
  return String(sum);
};

const constructUrl = (rootUrl: string) => {
  const [url, urlQuery] = rootUrl.split('?');
  const query = new URLSearchParams(urlQuery);
  return (rel: string, page: string, limit = String(query.get('limit'))) => {
    query.set('page', page);
    query.set('limit', limit);
    return `<${url}?${query.toString()}>; rel="${rel}"`;
  };
};

export interface ISearchPaginate<T> {
  data: T[];
  count: number;
  limit: number;
  skip: number;
}

export function getPageLinkHeader(
  rootUrl: string,
  query: Query<any>,
  data: ISearchPaginate<any>
) {
  if (!query.page) return '';
  if (data.count < data.limit) return '';
  const currentPage = query.page;
  const pages = Math.floor(data.count / data.limit);
  const getPage = addInRange(pages, currentPage);
  const toUrl = constructUrl(rootUrl);

  const next = toUrl('next', getPage(1));
  const prevSkip = getPage(-1);
  const prev = currentPage > 1 ? toUrl('prev', prevSkip) : '';
  const first = currentPage > 1 ? toUrl('first', '1') : '';
  const last = toUrl(
    'last',
    String(pages),
    String(data.count - pages * data.limit)
  );

  let link = `${next},${last}`;
  if (first) link += `,${first}`;
  if (prev) link += `,${prev}`;

  return link;
}
