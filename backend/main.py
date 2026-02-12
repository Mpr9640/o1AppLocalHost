from fastapi import FastAPI
from fastapi import Request   # for same prevent default error.Incoming HTTP request received by server.
from fastapi.middleware.cors import CORSMiddleware
import os # for .env files , Manages computer hardware and software resources.
from dotenv import load_dotenv #for .env files
import logging   # imported because we are facing problem with the error unable to see that is the typeerror e.preventdefault is not a function.
import uvicorn
from fastapi.responses import JSONResponse # paylaod returned by a web service from a  request.
from api import candidate, user # importing routers
#import dependencies
#from user, candidate  import  as user
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
import os
from api import jobs,metrics
load_dotenv()

import re

logger = logging.getLogger("uvicorn.error")


app = FastAPI()


frontend_url = os.getenv('FRONTEND_URL',"http://localhost:3000")
logging.basicConfig(level=logging.INFO)
logging.info(f"Allowed frontend URL: {frontend_url}")
origins=[frontend_url,"http://127.0.0.1:3000","http://localhost:3001",
         'chrome-extensions://neobfeaageldckcenkpcfihbjkfkngcb',]
app.add_middleware(    
    CORSMiddleware,
   
    allow_origins=origins,

    allow_credentials=True,
    allow_methods=["*"],  # ALlow all HTTP methods (GET, POST, etc..)
    allow_headers=["*"], 
)
if not os.path.exists('uploads'):
    os.makedirs('uploads')
app.mount('/uploads', StaticFiles(directory="uploads"),name='uploads')



@app.exception_handler(Exception)
async def global_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}")
    response = JSONResponse(
        status_code=500,
        content={"detail":"An unexpected error occured"}

    )
#Manually add CORS headers
    response.headers["Access-Control-Allow-Origin"] = frontend_url
    return response

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc:RequestValidationError):
    print(f'Validation Error: {exc}')
    response = JSONResponse(status_code=422, content={"detail": exc.errors(), "body": exc.body},)
    response.headers["Access-Control-Allow-Origin"] = frontend_url
    return response
@app.get('/')
def ping():
 return {"ok": True}
#Include routers from separate modules.
app.include_router(candidate.router, prefix="/api", tags=['Candidate'])
app.include_router(user.router, prefix="/api",tags=["User"])
app.include_router(jobs.router)#,prefix='/api/jobs',tags=['Jobs'])
app.include_router(metrics.router)
#app.include_router(dependencies.router, prefix="/api", tags=["Dependencies"])


if __name__ == "__main__":
    port = int(os.environ.get("PORT",8000))
    host=os.environ.get("HOST","localhost")
    uvicorn.run("main:app", host=host, port=port, reload=True)
  

               


