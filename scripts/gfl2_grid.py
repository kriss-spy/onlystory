"""Read active original grid rows, restoring serialized dynamic arguments."""


def grid_rows(grid):
    header = grid['rows'][0]['strings']
    indices, entities = grid.get('entityIndexTbl', []), grid.get('entityDataList', [])
    if len(indices) != len(entities):
        raise ValueError('Invalid dynamic argument table')
    originals = {index: item['originalStrings'] for index, item in zip(indices, entities)}
    for row in grid['rows'][1:]:
        if row.get('isEmpty') or row.get('isCommentOut'):
            continue
        strings = originals.get(row['rowIndex'], row['strings'])
        yield {**dict(zip(header, strings)), 'sourceRow': row['rowIndex']}
