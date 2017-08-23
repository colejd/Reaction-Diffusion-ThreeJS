export class FileLoader {

    // Loads all the files at the given URLs and returns them if they are all found.
    static LoadFiles(...urls) {

        // `fetch` wrapped in a promise that fails if the response is OK
        const FetchIfOk = url => fetch(url)
            .then(response => {
                
                if(response.ok) return response;
                else throw new Error(`${response.status} (${response.statusText}) for resource at ${url}`);
            })
            .then(response => {
                return response.text();
            })
            .catch(err => {
                throw err;
            })


        return Promise.all(urls.map(FetchIfOk))
            .then(responses => { return responses })
            .catch(error => { throw error });
        
    }


}