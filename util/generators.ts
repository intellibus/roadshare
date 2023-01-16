import { MicrositeURLParams, MicrositePageData } from 'types';

const BATCH_SIZE = 50;
const { SITES_GRID_ID, SITES_SHARE_ID } = process.env;

export const generateListOfPages = async function* (): AsyncGenerator<MicrositePageData> {
	let totalResults,
		index = 0;
	do {
		const response = await fetch(
			SITES_SHARE_ID
				? `https://www.bigparser.com/api/v2/grid/${SITES_GRID_ID}/share/${SITES_SHARE_ID}/search`
				: `https://www.bigparser.com/api/v2/grid/${SITES_GRID_ID}/search`,
			{
				method: 'POST',
				headers: { authId: process.env.BP_AUTH!, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: {
						pagination: { startRow: index + 1, rowCount: BATCH_SIZE },
						showColumnNamesInResponse: true
					}
				})
			}
		);
		const data = await response.json();

		for (let pageData of data.rows) {
			const pageComponents = pageData.URL.split('/');
			const pagePaths = pageComponents.splice(1).filter((path: string) => path);
			yield {
				...pageData,
				siteSlug: pageComponents[0],
				pageSlug: pagePaths.length <= 0 ? null : pagePaths
			};
		}

		totalResults = data.totalRowCount;

		index += BATCH_SIZE;
	} while (index < totalResults);
};

export const generatePagesWithMatchingURLs = async function* ({
	site,
	page
}: MicrositeURLParams): AsyncGenerator<MicrositePageData> {
	let totalResults,
		index = 0;
	do {
		const response = await fetch(
			SITES_SHARE_ID
				? `https://www.bigparser.com/api/v2/grid/${SITES_GRID_ID}/share/${SITES_SHARE_ID}/search`
				: `https://www.bigparser.com/api/v2/grid/${SITES_GRID_ID}/search`,
			{
				method: 'POST',
				headers: { authId: process.env.BP_AUTH!, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: {
						columnFilter: {
							filters: [
								{
									column: 'URL',
									operator: 'EQ',
									keyword: `${site}${page ? page.join('/') : ''}`
								},
								{
									column: 'URL',
									operator: 'EQ',
									keyword: `${site}/${page ? page.join('/') : ''}`
								},
								{
									column: 'URL',
									operator: 'EQ',
									keyword: `${site}/${page ? `${page.join('/')}/` : ''}`
								}
							],
							filtersJoinOperator: 'OR'
						},
						pagination: { startRow: index + 1, rowCount: BATCH_SIZE },
						showColumnNamesInResponse: true
					}
				})
			}
		);
		const data = await response.json();

		for (let pageData of data.rows) {
			yield {
				...pageData,
				siteSlug: site,
				pageSlug: page
			};
		}

		totalResults = data.totalRowCount;

		index += BATCH_SIZE;
	} while (index < totalResults);
};
