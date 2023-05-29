## Mongoose Query helper

### Info
Library to create middlewares for server to parse queries from users to valid mongoose queries.
This is just a base library to create your own query middleware. It does not provide any routes or controllers.\
Have another [mongoose-query-express](https://github.com/EmilsWebbod/mongoose-query-express) for that.

```
mongooseQuery in req is not set. You can use your own key.
function queryMiddleware(req, next) {
    req.mongooseQuery = new Query(req.query);
    next();
}

// This is used to set some logic for query to that model. Model for query is set in the controllers.
const modelQuery = new QueryModel<Doc>({
    limit: 10,
    query: ['name', 'slug'], // Valid queries for model. Filters all other fields
    select: ['_id', 'name', 'slug'], // Valid select fields for search,
    sort: ['_id', 'name'], // Valid sort fields. Not defined = all
    populate: [{
      path: 'organization', // Valid path to populate
      select: ['_id', 'name', 'slug'] // Valid fields to select from populated
    }]
});

function someController(req, res) {
    // add organization ID to root query so query will always search inside organization
    req.mongooseQuery.addToRoot({ organization: req.organization._id });
}

```

### Queries

#### Skip
``?skip=10``

#### Limit
``?limit=20``

#### Select (Accepts space and comma)
``?select=_id,name email``

#### Sort (Accepts space and comma)
``?sort=name,-_order``

#### Populate
``?$populate=organization:_id,name;user:_id,name``
Populates organization with _id and name and user with _id and name

#### Text
``?$text=some%20text``

#### Mongoose $in
``?$in__id=60ec0aa707bda11b64ecbf6b,60ec0aa707bda11b64ecbf6c``

#### Mongoose $gte $gt $lte $lt
``?$gte_createdAt=01.02.2023&$lt_createdAt=01.02.2023``
